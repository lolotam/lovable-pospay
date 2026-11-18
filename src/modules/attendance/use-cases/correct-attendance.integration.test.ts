// @vitest-environment node
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { getPool, withUser } from "@/lib/server/db.server";
import { correctAttendance } from "./correct-attendance";
import {
  pgCorrectionRepository,
  listForgottenAttendance,
} from "../persistence/correction-repository.server";

const url = process.env["POSPAY_TEST_DATABASE_URL"];
const company = "20000000-0000-0000-0000-000000000001";
const branch = "20000000-0000-0000-0000-000000000002";
const staff = "20000000-0000-0000-0000-000000000003";
const record = "20000000-0000-0000-0000-000000000004";
const input = {
  companyId: company,
  recordId: record,
  correctedAt: "2026-11-18T14:00:00+03:00",
  reason: "Forgot reception scan",
};

describe.skipIf(!url)("D-32 real correction transaction", () => {
  let admin: pg.Pool;
  beforeAll(async () => {
    if (!url) throw new Error("POSPAY_TEST_DATABASE_URL required");
    const parsed = new URL(url);
    if (parsed.hostname !== "127.0.0.1" || parsed.pathname !== "/pospay_test")
      throw new Error("Disposable localhost pospay_test required");
    vi.stubEnv("DATABASE_URL", url);
    admin = new pg.Pool({ connectionString: url });
    for (let pass = 0; pass < 2; pass++) {
      for (const file of ["0001_tenancy_foundation.sql", "0002_attendance.sql"])
        await admin.query(await readFile(`db/migrations/${file}`, "utf8"));
    }
    await admin.query("insert into public.companies(id,name) values ($1,'Correction salon')", [
      company,
    ]);
    await admin.query(
      "insert into public.branches(id,company_id,name) values ($1,$2,'Correction branch')",
      [branch, company],
    );
    await admin.query(
      `insert into public.memberships(company_id,user_id,role) values
      ($1,'correction-manager','branch_manager'),($1,'correction-staff','staff'),($1,'correction-denied','owner')`,
      [company],
    );
    await admin.query(
      "insert into public.permission_overrides(company_id,user_id,permission,effect) values ($1,'correction-denied','attendance.correct','deny')",
      [company],
    );
    await admin.query(
      "insert into public.staff_members(company_id,id,branch_id,user_id,display_name) values ($1,$2,$3,'correction-staff','Mona')",
      [company, staff, branch],
    );
    await admin.query(
      `insert into public.attendance_records(company_id,id,staff_id,branch_id,work_date,check_in_at,status)
      values ($1,$2,$3,$4,'2026-11-18','2026-11-18T06:00:00+03:00','forgotten')`,
      [company, record, staff, branch],
    );
  });
  afterAll(async () => {
    if (admin) {
      await admin.query("delete from public.companies where id=$1", [company]);
      await admin.end();
      await getPool().end();
    }
    vi.unstubAllEnvs();
  });
  const run = (user: string, data = input) =>
    withUser(user, (db) =>
      correctAttendance(
        { ...data, correctedAt: new Date(data.correctedAt) },
        {
          repo: pgCorrectionRepository(db, user),
          clock: { now: () => new Date("2026-11-18T20:00:00+03:00") },
        },
      ),
    );
  it("manager reads pending exceptions without other company rows", async () => {
    const rows = await withUser("correction-manager", (db) =>
      listForgottenAttendance(db, "correction-manager", company),
    );
    expect(
      rows.map((row) => ({ id: row.id, staffName: row.staffName, correctedAt: row.correctedAt })),
    ).toEqual([{ id: record, staffName: "Mona", correctedAt: null }]);
  });
  it("staff cannot read the managerial exception list", async () => {
    await expect(
      withUser("correction-staff", (db) =>
        listForgottenAttendance(db, "correction-staff", company),
      ),
    ).rejects.toThrow("FORBIDDEN");
  });
  it.each(["correction-staff", "foreign-user", "correction-denied"])(
    "rejects unauthorized correction from %s",
    async (user) => {
      await expect(run(user)).rejects.toThrow("FORBIDDEN");
      const result = await admin.query(
        "select corrected_check_out_at from public.attendance_records where id=$1",
        [record],
      );
      expect(result.rows[0].corrected_check_out_at).toBeNull();
    },
  );
  it("keeps original checkout and writes actor/reason evidence atomically", async () => {
    expect(await run("correction-manager")).toEqual({
      id: record,
      correctedAt: "2026-11-18T11:00:00.000Z",
      reason: "Forgot reception scan",
    });
    const result = await admin.query(
      `select check_out_at,previous_check_out_at,status,correction_reason,corrected_by
      from public.attendance_records where id=$1`,
      [record],
    );
    expect(result.rows[0]).toEqual({
      check_out_at: null,
      previous_check_out_at: null,
      status: "forgotten",
      correction_reason: "Forgot reception scan",
      corrected_by: "correction-manager",
    });
    const audit = await admin.query(
      "select actor_user_id,action,details from public.audit_log where entity_id=$1",
      [record],
    );
    expect(audit.rows).toEqual([
      {
        actor_user_id: "correction-manager",
        action: "attendance.corrected",
        details: {
          previousCheckOutAt: null,
          previousCorrectedAt: null,
          correctedAt: "2026-11-18T11:00:00.000Z",
          reason: "Forgot reception scan",
        },
      },
    ]);
  });
  it("does not overwrite a correction on duplicate submission", async () => {
    await expect(run("correction-manager", { ...input, reason: "Replacement" })).rejects.toThrow(
      "ALREADY_CORRECTED",
    );
    const audit = await admin.query(
      "select count(*)::int as total from public.audit_log where entity_id=$1",
      [record],
    );
    expect(audit.rows[0].total).toBe(1);
  });
});
