// @vitest-environment node
import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { getPool } from "@/lib/server/db.server";
import { getOperationalReportFn } from "@/modules/attendance/functions/report.functions";
import { getForgottenAttendanceFn } from "@/modules/attendance/functions/correction.functions";
import { getCardsFn, scanCardFn } from "@/modules/attendance/functions/card.functions";
import { getBranchQrFn } from "@/modules/attendance/functions/attendance.functions";
import { getCatalogFn } from "@/modules/services/functions/catalog.functions";
import { getDiscountSettingsFn } from "@/modules/services/functions/discount.functions";
import { getSessionFormFn } from "@/modules/services/functions/session.functions";
import { unbindPhoneFn } from "@/modules/staff/functions/phone.functions";
import { getTeamFn } from "@/modules/invitations/functions/invitation.functions";
const actor = vi.hoisted(() => ({ userId: "endpoint-manager" }));
vi.mock("@tanstack/react-start", () => ({
  createServerOnlyFn: (fn: unknown) => fn,
  createServerFn: () => ({
    handler: (fn: unknown) => fn,
    inputValidator: (validate: (v: unknown) => unknown) => ({
      handler:
        (fn: (arg: { data: unknown }) => unknown) =>
        ({ data }: { data: unknown }) =>
          fn({ data: validate(data) }),
    }),
  }),
}));
vi.mock("@/lib/server/session.server", () => ({ requireUserId: async () => actor.userId }));
vi.mock("@/modules/services/domain/session-availability", () => ({
  serviceSessionRecordingAvailable: true,
}));
const url = process.env["POSPAY_TEST_DATABASE_URL"];
const companyId = "70000000-0000-4000-8000-000000000001",
  branchId = "70000000-0000-4000-8000-000000000002",
  expectedUserId = actor.userId;
describe.skipIf(!url)("moved page handlers deny under real withUser RLS", () => {
  let admin: pg.Pool;
  beforeAll(async () => {
    if (!url || new URL(url).hostname !== "127.0.0.1" || new URL(url).pathname !== "/pospay_test")
      throw new Error("Disposable localhost pospay_test required");
    vi.stubEnv("DATABASE_URL", url);
    admin = new pg.Pool({ connectionString: url });
    const files = (await readdir("db/migrations")).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
    for (let pass = 0; pass < 2; pass++)
      for (const file of files) await admin.query(await readFile(`db/migrations/${file}`, "utf8"));
    await admin.query(`insert into public.companies(id,name) values($1,'Endpoint salon')`, [
      companyId,
    ]);
    await admin.query(
      `insert into public.branches(id,company_id,name) values($1,$2,'Endpoint branch')`,
      [branchId, companyId],
    );
    await admin.query(
      `insert into public.memberships(company_id,user_id,role,branch_id) values($1,$2,'branch_manager',$3)`,
      [companyId, expectedUserId, branchId],
    );
    for (const key of [
      "pos.access",
      "reports.view",
      "attendance.correct",
      "staff.manage",
      "services.manage",
      "discounts.manage",
    ])
      await admin.query(
        `insert into public.permission_overrides(company_id,user_id,permission,effect) values($1,$2,$3,'deny')`,
        [companyId, expectedUserId, key],
      );
  });
  afterAll(async () => {
    if (admin) {
      await admin.query("delete from public.companies where id=$1", [companyId]);
      await admin.end();
      await getPool().end();
    }
    vi.unstubAllEnvs();
  });
  it("reports.view deny refuses the reports handler", async () => {
    expect(
      await getOperationalReportFn({
        data: {
          companyId,
          expectedUserId,
          tab: "attendance",
          from: "2026-11-01T00:00:00Z",
          until: "2026-11-02T00:00:00Z",
        },
      }),
    ).toBe("FORBIDDEN");
  });
  it("attendance.correct deny refuses the corrections handler", async () => {
    await expect(getForgottenAttendanceFn({ data: { companyId } })).rejects.toThrow("FORBIDDEN");
  });
  it("staff.manage deny refuses the card manager handler", async () => {
    await expect(getCardsFn({ data: { companyId, expectedUserId } })).rejects.toThrow("FORBIDDEN");
  });
  it("services.manage deny refuses the catalog handler", async () => {
    expect(await getCatalogFn({ data: { companyId, expectedUserId } })).toBeNull();
  });
  it("discounts.manage deny refuses the discount handler", async () => {
    await expect(getDiscountSettingsFn({ data: { companyId, expectedUserId } })).rejects.toThrow(
      "FORBIDDEN",
    );
  });
  it("pos.access deny refuses reception QR even for a branch manager", async () => {
    await expect(getBranchQrFn({ data: { branchId } })).rejects.toThrow("FORBIDDEN");
  });
  it("pos.access deny refuses the card scan handler", async () => {
    expect(
      await scanCardFn({
        data: {
          companyId,
          expectedUserId,
          requestId: branchId,
          requestedAt: Date.now(),
          token: "a".repeat(48),
          intent: null,
        },
      }),
    ).toEqual({ status: "rejected" });
  });
  it("pos.access deny refuses sessions when the recording gate is open", async () => {
    await expect(getSessionFormFn({ data: { companyId } })).rejects.toThrow("FORBIDDEN");
  });
  it("staff.manage deny refuses phone unbinding", async () => {
    await expect(unbindPhoneFn({ data: { companyId, userId: "endpoint-staff" } })).rejects.toThrow(
      "FORBIDDEN",
    );
  });
  it("staff.manage deny refuses team invitation listing", async () => {
    await expect(getTeamFn({ data: { companyId } })).rejects.toThrow("FORBIDDEN");
  });
});
