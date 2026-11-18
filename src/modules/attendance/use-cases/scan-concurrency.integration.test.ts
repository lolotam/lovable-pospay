// @vitest-environment node
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { getPool, withUser } from "@/lib/server/db.server";
import { issueQrToken } from "../domain/qr-token";
import type { ScanIntent } from "../domain/scan-decision";
import type { AttendanceRepository } from "../ports/attendance-repository";
import { pgAttendanceRepository } from "../persistence/attendance-repository.server";
import { branchSigner } from "../persistence/qr-signer.server";
import { scanAttendance } from "./scan-attendance";

const databaseUrl = process.env["POSPAY_TEST_DATABASE_URL"];
const company = "80000000-0000-0000-0000-000000000001";
const branch = "80000000-0000-0000-0000-000000000002";
const staff = "80000000-0000-0000-0000-000000000003";
const morning = "80000000-0000-0000-0000-000000000004";
const evening = "80000000-0000-0000-0000-000000000005";
const record = "80000000-0000-0000-0000-000000000006";
const user = "attendance-transition-staff";
const at = (iso: string) => new Date(`${iso}+03:00`);

describe.skipIf(!databaseUrl)("attendance transition integrity under real RLS", () => {
  let admin: pg.Pool;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("POSPAY_TEST_DATABASE_URL required");
    const url = new URL(databaseUrl);
    if (url.hostname !== "127.0.0.1" || url.pathname !== "/pospay_test") {
      throw new Error("Integration tests require disposable localhost pospay_test");
    }
    vi.stubEnv("DATABASE_URL", databaseUrl);
    admin = new pg.Pool({ connectionString: databaseUrl });
    for (const file of ["0001_tenancy_foundation.sql", "0002_attendance.sql"]) {
      await admin.query(await readFile(`db/migrations/${file}`, "utf8"));
    }
    await admin.query("insert into public.companies(id,name) values($1,'Transition salon')", [
      company,
    ]);
    await admin.query(
      "insert into public.branches(id,company_id,name) values($1,$2,'Transition branch')",
      [branch, company],
    );
    await admin.query(
      "insert into public.memberships(company_id,user_id,role) values($1,$2,'staff')",
      [company, user],
    );
    await admin.query(
      "insert into public.staff_members(company_id,id,branch_id,user_id,display_name) values($1,$2,$3,$4,'Transition staff')",
      [company, staff, branch, user],
    );
    await admin.query(
      `insert into public.shifts(company_id,id,staff_id,starts_at,ends_at) values
       ($1,$2,$4,'2026-11-18T06:00+03:00','2026-11-18T14:00+03:00'),
       ($1,$3,$4,'2026-11-18T20:00+03:00','2026-11-19T02:00+03:00')`,
      [company, morning, evening, staff],
    );
  });

  beforeEach(async () => {
    await admin.query("delete from public.audit_log where company_id=$1", [company]);
    await admin.query("delete from public.attendance_records where company_id=$1", [company]);
    await admin.query(
      `insert into public.attendance_records(company_id,id,staff_id,branch_id,shift_id,work_date,check_in_at)
       values($1,$2,$3,$4,$5,'2026-11-18','2026-11-18T06:00+03:00')`,
      [company, record, staff, branch, morning],
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

  function concurrentReads() {
    let arrived = 0;
    let release: () => void = () => {};
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    return (repo: AttendanceRepository): AttendanceRepository => ({
      ...repo,
      async openRecord(companyId, staffId) {
        const open = await repo.openRecord(companyId, staffId);
        arrived += 1;
        if (arrived === 2) release();
        await ready;
        return open;
      },
    });
  }

  async function scan(
    time: Date,
    intent: ScanIntent,
    decorate: (repo: AttendanceRepository) => AttendanceRepository,
  ) {
    return withUser(user, async (db) => {
      const signer = await branchSigner(db, branch);
      if (!signer) throw new Error("Missing test signer");
      return scanAttendance(
        {
          token: await issueQrToken(branch, Math.floor(time.getTime() / 1000), signer),
          location: null,
          intent,
          promptedRecordId: record,
        },
        {
          repo: decorate(pgAttendanceRepository(db, user)),
          clock: { now: () => time },
          ids: { next: () => crypto.randomUUID() },
          signerFor: async () => signer,
        },
      );
    });
  }

  function assertSingleTransition(
    attempts: PromiseSettledResult<Awaited<ReturnType<typeof scan>>>[],
    outcome: "checked_in" | "checked_out",
  ) {
    const fulfilled = attempts.filter((attempt) => attempt.status === "fulfilled");
    const rejected = attempts.filter((attempt) => attempt.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(fulfilled[0]?.value.outcome).toBe(outcome);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason.message).toBe("ATTENDANCE_CONFLICT");
  }

  async function auditActions() {
    const { rows } = await admin.query(
      "select action from public.audit_log where company_id=$1 order by id",
      [company],
    );
    return rows.map((row) => row.action);
  }

  it("only one concurrent checkout succeeds and writes an audit", async () => {
    const decorate = concurrentReads();
    const attempts = await Promise.allSettled([
      scan(at("2026-11-18T17:00"), "check_out", decorate),
      scan(at("2026-11-18T17:00"), "check_out", decorate),
    ]);
    assertSingleTransition(attempts, "checked_out");
    const { rows } = await admin.query(
      "select status,check_out_at from public.attendance_records where company_id=$1",
      [company],
    );
    expect(rows).toEqual([{ status: "ok", check_out_at: at("2026-11-18T17:00") }]);
    expect(await auditActions()).toEqual(["attendance.check_out"]);
  });

  it("only one concurrent new shift replaces the previous open record", async () => {
    const decorate = concurrentReads();
    const attempts = await Promise.allSettled([
      scan(at("2026-11-18T20:00"), "new_shift", decorate),
      scan(at("2026-11-18T20:00"), "new_shift", decorate),
    ]);
    assertSingleTransition(attempts, "checked_in");
    const { rows } = await admin.query(
      "select status,check_in_at,check_out_at from public.attendance_records where company_id=$1 order by check_in_at",
      [company],
    );
    expect(rows).toEqual([
      { status: "forgotten", check_in_at: at("2026-11-18T06:00"), check_out_at: null },
      { status: "open", check_in_at: at("2026-11-18T20:00"), check_out_at: null },
    ]);
    expect(await auditActions()).toEqual(["attendance.forgotten", "attendance.check_in"]);
  });

  it("a stale forgotten transition rejects without changing a resolved checkout", async () => {
    await withUser(user, (db) =>
      pgAttendanceRepository(db, user).close(company, record, at("2026-11-18T17:00"), "ok", null),
    );
    await expect(
      withUser(user, (db) => pgAttendanceRepository(db, user).markForgotten(company, record)),
    ).rejects.toThrow("ATTENDANCE_CONFLICT");
    const { rows } = await admin.query(
      "select status,check_out_at from public.attendance_records where company_id=$1",
      [company],
    );
    expect(rows).toEqual([{ status: "ok", check_out_at: at("2026-11-18T17:00") }]);
    expect(await auditActions()).toEqual([]);
  });

  it("an audit failure rolls a checkout back to its original open state", async () => {
    await expect(
      scan(at("2026-11-18T17:00"), "check_out", (repo) => ({
        ...repo,
        async audit() {
          throw new Error("TEST_AUDIT_UNAVAILABLE");
        },
      })),
    ).rejects.toThrow("TEST_AUDIT_UNAVAILABLE");
    const { rows } = await admin.query(
      "select status,check_out_at from public.attendance_records where company_id=$1",
      [company],
    );
    expect(rows).toEqual([{ status: "open", check_out_at: null }]);
    expect(await auditActions()).toEqual([]);
  });
});
