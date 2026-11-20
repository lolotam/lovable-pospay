// @vitest-environment node
import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { getPool, withUser } from "@/lib/server/db.server";
import { pgSessionRepository } from "./session.server";
import { pgDiscountApprovalRepository } from "./discount-approval.server";
import { recordSession, type RecordSessionInput } from "../use-cases/record-session";

const url = process.env["POSPAY_TEST_DATABASE_URL"];
const company = "18000000-0000-4000-8000-000000000001";
const branch = "18000000-0000-4000-8000-000000000002";
const staff = "18000000-0000-4000-8000-000000000003";
const service = "18000000-0000-4000-8000-000000000004";
const reception = "i018-reception";
const otherReception = "i018-reception-2";
const manager = "i018-manager";
const baseInput = {
  requestId: "18000000-0000-4000-8000-000000000010",
  serviceId: service,
  staffId: staff,
  clientName: "Noura",
  clientPhone: "96555551234",
  occurredAt: new Date(Date.now() - 3600_000).toISOString().slice(0, 16),
};

function run(user: string, overrides: Partial<RecordSessionInput> = {}) {
  return withUser(user, (db) =>
    recordSession(
      pgSessionRepository(db, user, company),
      pgDiscountApprovalRepository(db, company),
      { ...baseInput, ...overrides },
      new Date(),
    ),
  );
}

describe.skipIf(!url)("service session idempotency with real RLS", () => {
  let admin: pg.Pool;

  beforeAll(async () => {
    if (
      !url ||
      !["127.0.0.1", "localhost"].includes(new URL(url).hostname) ||
      new URL(url).pathname !== "/pospay_test"
    )
      throw new Error("Disposable localhost pospay_test required");
    vi.stubEnv("DATABASE_URL", url);
    admin = new pg.Pool({ connectionString: url });
    for (let pass = 0; pass < 2; pass++)
      for (const file of (await readdir("db/migrations"))
        .filter((f) => /^\d{4}_.*\.sql$/.test(f))
        .sort())
        await admin.query(await readFile(`db/migrations/${file}`, "utf8"));
    await admin.query("insert into public.companies(id,name) values($1,'Idempotent salon')", [
      company,
    ]);
    await admin.query(
      "insert into public.branches(id,company_id,name,timezone) values($1,$2,'Main','UTC')",
      [branch, company],
    );
    await admin.query(
      `insert into public.memberships(company_id,user_id,role,branch_id) values
       ($1,$2,'reception',$4),($1,$3,'reception',$4),($1,'i018-manager','branch_manager',$4)`,
      [company, reception, otherReception, branch],
    );
    await admin.query(
      "insert into public.staff_members(company_id,id,branch_id,user_id,display_name) values($1,$2,$3,'i018-staff','Mona')",
      [company, staff, branch],
    );
    await admin.query(
      "insert into public.service_catalog(company_id,id,name,price_mills) values($1,$2,'Hair',100000)",
      [company, service],
    );
    await admin.query(
      "insert into public.service_assignments(company_id,service_id,staff_id) values($1,$2,$3)",
      [company, service, staff],
    );
    await admin.query(
      "insert into public.discount_grants(company_id,role,max_percent,granted_by) values($1,'reception',10,$2)",
      [company, manager],
    );
  });

  afterAll(async () => {
    if (admin) {
      for (const table of [
        "service_sessions",
        "clients",
        "audit_log",
        "discount_grants",
        "service_assignments",
        "service_catalog",
        "staff_members",
        "memberships",
        "branches",
      ])
        await admin.query(`delete from public.${table} where company_id=$1`, [company]);
      await admin.query("delete from public.companies where id=$1", [company]);
      await admin.end();
      await getPool().end();
    }
    vi.unstubAllEnvs();
  });

  it("replays concurrent and sequential retries and rejects changed or foreign requests", async () => {
    const duplicates = await Promise.all([run(reception), run(reception)]);
    expect(duplicates).toHaveLength(2);
    expect(duplicates).toEqual(
      expect.arrayContaining([
        { status: "saved", id: baseInput.requestId, replayed: false },
        { status: "saved", id: baseInput.requestId, replayed: true },
      ]),
    );
    await expect(run(reception)).resolves.toEqual({
      status: "saved",
      id: baseInput.requestId,
      replayed: true,
    });
    await expect(run(reception, { clientPhone: "96555554321" })).rejects.toThrow(
      "IDEMPOTENCY_CONFLICT",
    );
    await expect(run(otherReception)).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    await admin.query(
      "update public.service_assignments set active=false where company_id=$1 and service_id=$2 and staff_id=$3",
      [company, service, staff],
    );
    await expect(run(reception)).resolves.toEqual({
      status: "saved",
      id: baseInput.requestId,
      replayed: true,
    });
    await admin.query(
      "update public.service_assignments set active=true where company_id=$1 and service_id=$2 and staff_id=$3",
      [company, service, staff],
    );
    const sessions = await admin.query(
      "select count(*)::int as count from public.service_sessions where company_id=$1 and id=$2",
      [company, baseInput.requestId],
    );
    const audits = await admin.query(
      "select count(*)::int as count from public.audit_log where company_id=$1 and entity_id=$2 and action='session.recorded'",
      [company, baseInput.requestId],
    );
    expect(sessions.rows[0]?.count).toBe(1);
    expect(audits.rows[0]?.count).toBe(1);
  });

  it("enforces the ق-1 discount cap for reception and allows the branch manager", async () => {
    const accepted = "18000000-0000-4000-8000-000000000011";
    const rejected = "18000000-0000-4000-8000-000000000012";
    const managed = "18000000-0000-4000-8000-000000000013";
    await expect(
      run(reception, {
        requestId: accepted,
        price: "90.000",
        discountReason: "vip",
        confirmDuplicate: true,
      }),
    ).resolves.toEqual({ status: "saved", id: accepted, replayed: false });
    await expect(
      run(reception, {
        requestId: rejected,
        price: "85.000",
        discountReason: "vip",
        confirmDuplicate: true,
      }),
    ).resolves.toEqual({ status: "pin_required", approvers: [] });
    await expect(
      run(manager, {
        requestId: managed,
        price: "85.000",
        discountReason: "vip",
        confirmDuplicate: true,
      }),
    ).resolves.toEqual({ status: "saved", id: managed, replayed: false });
    const { rows } = await admin.query(
      "select id::text,price_mills::text from public.service_sessions where company_id=$1 and id=any($2::uuid[]) order by id",
      [company, [accepted, managed]],
    );
    expect(rows).toEqual([
      { id: accepted, price_mills: "90000" },
      { id: managed, price_mills: "85000" },
    ]);
  });
});
