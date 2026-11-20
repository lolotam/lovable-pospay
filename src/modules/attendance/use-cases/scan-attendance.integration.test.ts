// @vitest-environment node
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { scanAttendance } from "./scan-attendance";
import { pgAttendanceRepository } from "../persistence/attendance-repository.server";
import { branchSigner } from "../persistence/qr-signer.server";
import { issueQrToken } from "../domain/qr-token";
import { getPool, withUser } from "@/lib/server/db.server";

const databaseUrl = process.env["POSPAY_TEST_DATABASE_URL"];
const company = "00000000-0000-0000-0000-000000000001";
const branch = "00000000-0000-0000-0000-000000000002";
const staff = "00000000-0000-0000-0000-000000000003";
const user = "attendance-test-staff";
const at = (value: string) => new Date(`${value}+03:00`);

describe.skipIf(!databaseUrl)("attendance with real PostgreSQL and RLS", () => {
  let admin: pg.Pool;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("POSPAY_TEST_DATABASE_URL required");
    const url = new URL(databaseUrl);
    if (url.hostname !== "127.0.0.1" || url.pathname !== "/pospay_test") {
      throw new Error("Integration tests require a disposable localhost pospay_test database");
    }
    vi.stubEnv("DATABASE_URL", databaseUrl);
    admin = new pg.Pool({ connectionString: databaseUrl });
    for (let pass = 0; pass < 2; pass++) {
      for (const file of [
        "0001_tenancy_foundation.sql",
        "0002_attendance.sql",
        "0003_phone_binding.sql",
        "0004_platform_connectors.sql",
        "0006_better_auth.sql",
        "0009_attendance_branch_company.sql",
        "0011_barcode.sql",
        "0012_service_catalog.sql",
        "0013_service_sessions.sql",
        "0014_discount_grants.sql",
        "0015_invitations.sql",
        "0016_discount_grant_membership.sql",
        "0017_invitation_scope.sql",
        "0018_app_structure.sql",
        "0020_permission_admin.sql",
      ]) {
        await admin.query(await readFile(`db/migrations/${file}`, "utf8"));
      }
    }
    await admin.query(`insert into public.companies (id,name) values ($1,'Test salon')`, [company]);
    await admin.query(
      `insert into public.branches (id,company_id,name,latitude,longitude)
      values ($1,$2,'Test branch',29.3759,47.9774)`,
      [branch, company],
    );
    await admin.query(
      `insert into public.memberships (company_id,user_id,role) values ($1,$2,'staff')`,
      [company, user],
    );
    await admin.query(
      `insert into public.staff_members (company_id,id,branch_id,user_id,display_name)
      values ($1,$2,$3,$4,'Test staff')`,
      [company, staff, branch, user],
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

  async function scan(
    time: Date,
    intent: "new_shift" | "check_out" | null = null,
    valid = true,
    promptedRecordId?: string,
  ) {
    return withUser(user, async (db) => {
      const sign = await branchSigner(db, branch);
      if (!sign) throw new Error("Missing test branch signer");
      const token = await issueQrToken(
        branch,
        Math.floor(time.getTime() / 1000) - (valid ? 0 : 61),
        sign,
      );
      return scanAttendance(
        { token, location: { latitude: 29.3759, longitude: 47.9774 }, intent, promptedRecordId },
        {
          repo: pgAttendanceRepository(db, user),
          clock: { now: () => time },
          ids: { next: () => crypto.randomUUID() },
          signerFor: async () => sign,
        },
      );
    });
  }

  it("runs the SQL company isolation acceptance test", async () => {
    const sql = (await readFile("db/tests/isolation.sql", "utf8")).replace(/^\\echo.*$/gm, "");
    // The acceptance script requires an empty database, so temporarily hide our fixtures.
    const client = await admin.connect();
    try {
      await client.query("begin");
      // 0025 introduced mutually referencing approval tables, so company
      // cascade deletion needs FK triggers off; with triggers off the
      // cascades are off too, so the fixture rows are deleted explicitly.
      await client.query("set local session_replication_role = replica");
      await client.query("delete from public.companies where id=$1", [company]);
      for (const table of [
        "service_sessions",
        "clients",
        "service_assignments",
        "service_catalog",
        "attendance_records",
        "staff_members",
        "memberships",
        "branches",
      ])
        await client.query(`delete from public.${table} where company_id=$1`, [company]);
      await client.query("set local session_replication_role = origin");
      for (const late of ["0025_session_controls", "0026_commission_methods_and_salaries"]) {
        await client.query(await readFile(`db/migrations/${late}.sql`, "utf8"));
      }
      await client.query(sql.replace(/^begin;$/m, "").replace(/^rollback;$/m, ""));
    } finally {
      await client.query("rollback");
      client.release();
    }
  });

  it("ق-6 stores a new shift, forgotten exception and audited late check-out", async () => {
    await admin.query(
      `insert into public.shifts (company_id,id,staff_id,starts_at,ends_at) values
      ($1,'00000000-0000-0000-0000-000000000004',$2,$3,$4),
      ($1,'00000000-0000-0000-0000-000000000005',$2,$5,$6)`,
      [
        company,
        staff,
        at("2026-11-18T06:00"),
        at("2026-11-18T14:00"),
        at("2026-11-18T20:00"),
        at("2026-11-19T02:00"),
      ],
    );
    expect(await scan(at("2026-11-18T06:00"))).toEqual({
      outcome: "checked_in",
      lateMinutes: 0,
      exception: null,
    });
    const prompt = await scan(at("2026-11-18T20:00"));
    expect(prompt.outcome).toBe("needs_intent");
    if (prompt.outcome !== "needs_intent") throw new Error("Expected an attendance prompt");
    expect(await scan(at("2026-11-18T22:01"), "new_shift", true, prompt.recordId)).toEqual({
      outcome: "rejected",
      reason: "stale_intent",
    });
    expect(await scan(at("2026-11-18T20:00"), "new_shift", true, prompt.recordId)).toEqual({
      outcome: "checked_in",
      lateMinutes: 0,
      exception: null,
    });
    const { rows } = await admin.query(
      "select status,check_out_at,work_date::text from public.attendance_records where company_id=$1 order by check_in_at",
      [company],
    );
    expect(rows).toEqual([
      { status: "forgotten", check_out_at: null, work_date: "2026-11-18" },
      { status: "open", check_out_at: null, work_date: "2026-11-18" },
    ]);
    expect(await scan(at("2026-11-19T06:01"), "check_out", true, prompt.recordId)).toEqual({
      outcome: "rejected",
      reason: "stale_intent",
    });
    expect(await scan(at("2026-11-19T06:01"))).toEqual({
      outcome: "checked_out",
      status: "closed_late",
      exception: null,
    });
    const audit = await admin.query(
      "select action from public.audit_log where company_id=$1 order by id",
      [company],
    );
    expect(audit.rows.map((r) => r.action)).toEqual([
      "attendance.check_in",
      "attendance.forgotten",
      "attendance.check_in",
      "attendance.check_out",
    ]);
  });

  it("rejects a 61-second QR without changing stored attendance", async () => {
    const before = await admin.query(
      "select count(*)::int as total from public.attendance_records where company_id=$1",
      [company],
    );
    expect(await scan(at("2026-11-19T07:00"), null, false)).toEqual({
      outcome: "rejected",
      reason: "invalid_qr",
    });
    const after = await admin.query(
      "select count(*)::int as total from public.attendance_records where company_id=$1",
      [company],
    );
    expect(after.rows).toEqual(before.rows);
  });
});
