// @vitest-environment node
import { readFile } from "node:fs/promises";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import pg from "pg";
import { getPool, withUser } from "@/lib/server/db.server";
import { pgSessionRepository, readSessionForm } from "./session.server";
import { readSessionReport } from "./session-report.server";
import { recordSession } from "../use-cases/record-session";
import { saveDiscountGrant } from "./discount.server";
const url = process.env["POSPAY_TEST_DATABASE_URL"];
const company = "40000000-0000-0000-0000-000000000001",
  branch = "40000000-0000-0000-0000-000000000002",
  staff = "40000000-0000-0000-0000-000000000003",
  service = "40000000-0000-0000-0000-000000000004";
const input = {
  serviceId: service,
  staffId: staff,
  clientName: "Noura",
  clientPhone: "96555551234",
  occurredAt: new Date(Date.now() - 3600_000),
};
const run = (user: string) =>
  withUser(user, (db) =>
    recordSession(pgSessionRepository(db, user, company), input, new Date(), () =>
      crypto.randomUUID(),
    ),
  );
describe.skipIf(!url)("service sessions real RLS", () => {
  let admin: pg.Pool;
  beforeAll(async () => {
    if (!url || new URL(url).hostname !== "127.0.0.1" || new URL(url).pathname !== "/pospay_test")
      throw new Error("Disposable database required");
    vi.stubEnv("DATABASE_URL", url);
    admin = new pg.Pool({ connectionString: url });
    for (let pass = 0; pass < 2; pass++)
      for (const f of [
        "0001_tenancy_foundation",
        "0002_attendance",
        "0003_phone_binding",
        "0008_phone_binding_lock",
        "0009_attendance_branch_company",
        "0011_barcode",
        "0012_service_catalog",
        "0013_service_sessions",
        "0014_discount_grants",
      ])
        await admin.query(await readFile(`db/migrations/${f}.sql`, "utf8"));
    await admin.query(`insert into companies(id,name) values($1,'Sessions salon')`, [company]);
    await admin.query(`insert into branches(id,company_id,name) values($1,$2,'S branch')`, [
      branch,
      company,
    ]);
    await admin.query(
      `insert into memberships(company_id,user_id,role,branch_id) values($1,'s-reception','reception',$2),($1,'s-staff','staff',$2),($1,'s-owner','owner',null)`,
      [company, branch],
    );
    await admin.query(
      `insert into staff_members(company_id,id,branch_id,user_id,display_name) values($1,$2,$3,'s-staff','Mona')`,
      [company, staff, branch],
    );
    await admin.query(
      `insert into service_catalog(company_id,id,name,price_mills) values($1,$2,'Hair',12500)`,
      [company, service],
    );
    await admin.query(
      `insert into service_assignments(company_id,service_id,staff_id) values($1,$2,$3)`,
      [company, service, staff],
    );
  });
  afterAll(async () => {
    if (admin) {
      for (const t of [
        "service_sessions",
        "clients",
        "service_assignments",
        "service_catalog",
        "audit_log",
      ])
        await admin.query(`delete from ${t} where company_id=$1`, [company]);
      await admin.query(`delete from companies where id=$1`, [company]);
      await admin.end();
      await getPool().end();
    }
    vi.unstubAllEnvs();
  });
  it("employee cannot record a session", async () => {
    await expect(run("s-staff")).rejects.toThrow();
  });
  it("reception records with catalog price and owner report masks the phone", async () => {
    await run("s-reception");
    const rows = await withUser("s-owner", (db) =>
      readSessionReport(
        db,
        company,
        new Date(Date.now() - 86400_000).toISOString(),
        new Date(Date.now() + 60_000).toISOString(),
      ),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "Mona",
      service: "Hair",
      priceMills: "12500",
      clientName: "Noura",
      clientPhone: "•••234",
      late: false,
    });
  });
  it("same phone reuses one client per company (D-30)", async () => {
    await run("s-reception");
    const c = await admin.query(`select count(*)::int as n from clients where company_id=$1`, [
      company,
    ]);
    expect(c.rows[0].n).toBe(1);
  });
  it("employee sees no recording form", async () => {
    const form = await withUser("s-staff", (db) => readSessionForm(db, company));
    expect(form.canRecord).toBe(false);
  });
  it("enforces the granted discount limit in RLS (ق-1)", async () => {
    const disc = (user: string, priceMills: bigint) =>
      withUser(user, (db) =>
        recordSession(
          pgSessionRepository(db, user, company),
          { ...input, priceMills, discountReason: "vip" },
          new Date(),
          () => crypto.randomUUID(),
        ),
      );
    await expect(disc("s-reception", 11250n)).rejects.toThrow("DISCOUNT_OVER_LIMIT");
    await expect(
      withUser("s-reception", (db) =>
        db.query(
          `insert into service_sessions(company_id,service_id,staff_id,branch_id,client_id,occurred_at,service_name,price_mills,list_price_mills,discount_reason,recorded_by)
           select $1,$2,$3,$4,id,now(),'Hair',1,12500,'x','s-reception' from clients where company_id=$1 limit 1`,
          [company, service, staff, branch],
        ),
      ),
    ).rejects.toThrow();
    await expect(
      withUser("s-reception", (db) =>
        saveDiscountGrant(db, "s-reception", company, { kind: "role", role: "reception" }, 50),
      ),
    ).rejects.toThrow();
    await withUser("s-owner", (db) =>
      saveDiscountGrant(db, "s-owner", company, { kind: "role", role: "reception" }, 10),
    );
    await expect(disc("s-reception", 11250n)).resolves.toHaveProperty("id");
    await expect(disc("s-reception", 11249n)).rejects.toThrow("DISCOUNT_OVER_LIMIT");
  });
});
