// @vitest-environment node
import { readFile } from "node:fs/promises";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import pg from "pg";
import { getPool, withUser } from "@/lib/server/db.server";
import { cardAudit, insertCardPolicy, readCardAccess, readCards } from "./card-repository.server";
import { cardTokens, pgCardRepository } from "./card-actions.server";
import { scanCard as readCardScan } from "./card-scan.server";
import { readAttendanceReport } from "./report.server";
import {
  approveCardPolicy,
  issueCardUseCase,
  loadCardManagement,
  revokeCardUseCase,
} from "../use-cases/card-actions";
import { readCardStatus, recordCard } from "../use-cases/card-scan";
import { cryptoIds } from "@/shared/kernel/ids";
const issueCard = (db: pg.PoolClient, user: string, company: string, staff: string) =>
  issueCardUseCase(pgCardRepository(db, user, company), cardTokens, staff);
const revokeCard = (db: pg.PoolClient, user: string, company: string, card: string) =>
  revokeCardUseCase(pgCardRepository(db, user, company), card);
const scanCard = async (
  db: pg.PoolClient,
  user: string,
  input: Omit<Parameters<typeof recordCard>[0], "location"> & { companyId: string },
) =>
  recordCard(
    { ...input, location: null },
    await readCardScan(db, user, input),
    { now: () => new Date("2026-11-18T10:00:00Z") },
    cryptoIds,
  );
const approveCards = (db: pg.PoolClient, user: string, companyId: string) =>
  approveCardPolicy({
    insert: () => insertCardPolicy(db, user, companyId),
    audit: () => cardAudit(db, user, companyId, "cards.policy_approved", companyId, {}),
  });
const url = process.env["POSPAY_TEST_DATABASE_URL"];
const company = "30000000-0000-0000-0000-000000000001",
  branch = "30000000-0000-0000-0000-000000000002",
  staff = "30000000-0000-0000-0000-000000000003",
  other = "30000000-0000-0000-0000-000000000004";
describe.skipIf(!url)("card/report real RLS", () => {
  let admin: pg.Pool;
  let token = "";
  let cardId = "";
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
      ])
        await admin.query(await readFile(`db/migrations/${f}.sql`, "utf8"));
    await admin.query(
      `insert into companies(id,name) values($1,'Cards salon'),($2,'Other salon')`,
      [company, other],
    );
    await admin.query(`insert into branches(id,company_id,name) values($1,$2,'Cards branch')`, [
      branch,
      company,
    ]);
    await admin.query(
      `insert into memberships(company_id,user_id,role,branch_id) values($1,'cards-manager','branch_manager',$2),($1,'cards-owner','owner',null),($1,'cards-reception','reception',$2),($1,'cards-staff','staff',$2),($1,'cards-viewer','viewer',null)`,
      [company, branch],
    );
    await admin.query(
      `insert into staff_members(company_id,id,branch_id,user_id,display_name) values($1,$2,$3,'cards-staff','Mona')`,
      [company, staff, branch],
    );
  });
  afterAll(async () => {
    if (admin) {
      await admin.query(`delete from attendance_cards where company_id=$1`, [company]);
      await admin.query(`delete from companies where id in($1,$2)`, [company, other]);
      await admin.end();
      await getPool().end();
    }
    vi.unstubAllEnvs();
  });
  it("owner cannot approve manager-only issuance policy", async () => {
    await expect(
      withUser("cards-owner", (db) => approveCards(db, "cards-owner", company)),
    ).rejects.toThrow();
  });
  it("manager cannot issue before policy approval", async () => {
    await expect(
      withUser("cards-manager", (db) => issueCard(db, "cards-manager", company, staff)),
    ).rejects.toThrow("FORBIDDEN");
  });
  it("manager approves and issues only a hashed token", async () => {
    await withUser("cards-manager", (db) => approveCards(db, "cards-manager", company));
    const c = await withUser("cards-manager", (db) =>
      issueCard(db, "cards-manager", company, staff),
    );
    token = c.token;
    cardId = c.cardId;
    expect(token).toMatch(/^[a-f0-9]{48}$/);
    const stored = await admin.query(`select token_hash from attendance_cards where id=$1`, [
      cardId,
    ]);
    expect(stored.rows[0].token_hash).not.toBe(token);
    expect(stored.rows[0].token_hash).toHaveLength(64);
  });
  it("target employee deny blocks reception scan", async () => {
    await admin.query(
      `insert into permission_overrides(company_id,user_id,permission,effect) values($1,'cards-staff','attendance.record','deny')`,
      [company],
    );
    await expect(
      withUser("cards-reception", (db) =>
        scanCard(db, "cards-reception", { companyId: company, token, intent: null }),
      ),
    ).rejects.toThrow("CARD_REVOKED");
    await admin.query(
      `delete from permission_overrides where company_id=$1 and user_id='cards-staff'`,
      [company],
    );
  });
  it("card-management denial does not revoke scan permission", async () => {
    await admin.query(
      "insert into permission_overrides(company_id,user_id,permission,effect) values($1,'cards-manager','attendance.manage_cards','deny')",
      [company],
    );
    try {
      await expect(
        withUser("cards-manager", async (db) => {
          const { rows } = await db.query(
            "select public.card_operator($1,$2) as operator,public.card_manager($1,$2) as manager",
            [company, branch],
          );
          return rows[0];
        }),
      ).resolves.toEqual({ operator: true, manager: false });
    } finally {
      await admin.query(
        "delete from permission_overrides where company_id=$1 and user_id='cards-manager' and permission='attendance.manage_cards'",
        [company],
      );
    }
  });
  it("manager recording deny does not prevent immediate revocation", async () => {
    await admin.query(
      `insert into permission_overrides(company_id,user_id,permission,effect) values($1,'cards-manager','attendance.record','deny')`,
      [company],
    );
    try {
      await withUser("cards-manager", (db) => revokeCard(db, "cards-manager", company, cardId));
    } finally {
      await admin.query(
        `delete from permission_overrides where company_id=$1 and user_id='cards-manager'`,
        [company],
      );
    }
    const c = await withUser("cards-manager", (db) =>
      issueCard(db, "cards-manager", company, staff),
    );
    token = c.token;
    cardId = c.cardId;
  });
  it("second card is rejected", async () => {
    await expect(
      withUser("cards-manager", (db) => issueCard(db, "cards-manager", company, staff)),
    ).rejects.toThrow("ACTIVE_CARD");
  });
  it("active card blocks phone binding in database", async () => {
    await expect(
      withUser("cards-staff", (db) =>
        db.query(
          `insert into phone_bindings(company_id,user_id,credential_id,device_hash) values($1,'cards-staff','test-credential','test-device')`,
          [company],
        ),
      ),
    ).rejects.toThrow("ACTIVE_CARD");
  });
  it("reception scans check-in then checkout", async () => {
    expect(
      (
        await withUser("cards-reception", (db) =>
          scanCard(db, "cards-reception", { companyId: company, token, intent: null }),
        )
      ).result.outcome,
    ).toBe("checked_in");
    await expect(
      withUser("cards-reception", async (db) =>
        readCardStatus(await readCardScan(db, "cards-reception", { companyId: company, token })),
      ),
    ).resolves.toEqual({ name: "Mona", checkedIn: true });
    await expect(
      withUser("cards-reception", (db) =>
        db.query(
          "update public.attendance_records set late_minutes=99 where company_id=$1 and status='open'",
          [company],
        ),
      ),
    ).rejects.toThrow("INVALID_CARD_ATTENDANCE_TRANSITION");
    expect(
      (
        await withUser("cards-reception", (db) =>
          scanCard(db, "cards-reception", { companyId: company, token, intent: null }),
        )
      ).result.outcome,
    ).toBe("checked_out");
    await expect(
      withUser("cards-reception", async (db) =>
        readCardStatus(await readCardScan(db, "cards-reception", { companyId: company, token })),
      ),
    ).resolves.toEqual({ name: "Mona", checkedIn: false });
    await expect(
      withUser(
        "cards-reception",
        async (db) =>
          (
            await db.query(
              "update public.attendance_records set late_minutes=99 where company_id=$1 and status='ok'",
              [company],
            )
          ).rowCount,
      ),
    ).resolves.toBe(0);
  });
  it("reception waits for a manager revocation and rejects the card after commit", async () => {
    await withUser("cards-manager", async (db) => {
      await revokeCard(db, "cards-manager", company, cardId);
      await expect(
        withUser("cards-reception", async (reader) => {
          await reader.query("set local lock_timeout = '100ms'");
          return scanCard(reader, "cards-reception", { companyId: company, token, intent: null });
        }),
      ).rejects.toMatchObject({ code: "55P03" });
    });
    await expect(
      withUser("cards-reception", (db) =>
        scanCard(db, "cards-reception", { companyId: company, token, intent: null }),
      ),
    ).rejects.toThrow("CARD_REVOKED");
  });
  it("active phone blocks reissue", async () => {
    await withUser("cards-staff", (db) =>
      db.query(
        `insert into phone_bindings(company_id,user_id,credential_id,device_hash) values($1,'cards-staff','test-credential','test-device')`,
        [company],
      ),
    );
    await expect(
      withUser("cards-manager", (db) => issueCard(db, "cards-manager", company, staff)),
    ).rejects.toThrow("ACTIVE_PHONE");
  });
  it("foreign company management is denied", async () => {
    await expect(
      withUser("cards-manager", (db) =>
        loadCardManagement({
          access: () => readCardAccess(db, other),
          read: () => readCards(db, other),
        }),
      ),
    ).rejects.toThrow("FORBIDDEN");
  });
  it("viewer sees attendance only inside half-open range", async () => {
    const rows = await withUser("cards-viewer", (db) =>
      readAttendanceReport(db, company, "2026-01-01T00:00:00Z", "2027-01-01T00:00:00Z", 20),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("Mona");
    const empty = await withUser("cards-viewer", (db) =>
      readAttendanceReport(db, company, "2025-01-01T00:00:00Z", "2026-01-01T00:00:00Z", 20),
    );
    expect(empty).toEqual([]);
  });
  it("branch manager cannot issue or scan another branch", async () => {
    const b = "30000000-0000-0000-0000-000000000005",
      s = "30000000-0000-0000-0000-000000000006";
    await admin.query(`insert into branches(company_id,id,name) values($1,$2,'Other branch')`, [
      company,
      b,
    ]);
    await admin.query(
      `insert into staff_members(company_id,id,branch_id,display_name) values($1,$2,$3,'Other employee')`,
      [company, s, b],
    );
    await expect(
      withUser("cards-manager", (db) => issueCard(db, "cards-manager", company, s)),
    ).rejects.toThrow("FORBIDDEN");
  });
  it("simultaneous phone binding and card issuance leave exactly one method", async () => {
    await admin.query(`delete from phone_bindings where company_id=$1 and user_id='cards-staff'`, [
      company,
    ]);
    const results = await Promise.allSettled([
      withUser("cards-manager", (db) => issueCard(db, "cards-manager", company, staff)),
      withUser("cards-staff", (db) =>
        db.query(
          `insert into phone_bindings(company_id,user_id,credential_id,device_hash) values($1,'cards-staff','race-credential','race-device')`,
          [company],
        ),
      ),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const counts = await admin.query(
      `select (select count(*) from phone_bindings where company_id=$1 and user_id='cards-staff')+(select count(*) from attendance_cards where company_id=$1 and staff_id=$2 and revoked_at is null) as methods`,
      [company, staff],
    );
    expect(counts.rows[0].methods).toBe("1");
  });
  it("report retains original checkout and correction reason", async () => {
    await admin.query(
      `update attendance_records set corrected_check_out_at=check_out_at+interval '1 hour',correction_reason='Forgot checkout' where company_id=$1`,
      [company],
    );
    const rows = await withUser("cards-viewer", (db) =>
      readAttendanceReport(db, company, "2026-01-01T00:00:00Z", "2027-01-01T00:00:00Z", 20),
    );
    expect(rows[0]?.reason).toBe("Forgot checkout");
    expect(rows[0]?.corrected).not.toBe(rows[0]?.checkOut);
  });
  it("reception cannot read operational reports", async () => {
    await expect(
      withUser("cards-reception", (db) =>
        readAttendanceReport(db, company, "2026-01-01T00:00:00Z", "2027-01-01T00:00:00Z", 20),
      ),
    ).rejects.toThrow("FORBIDDEN");
  });
});
