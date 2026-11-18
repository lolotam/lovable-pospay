// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { getOperationalReportFn } from "@/modules/attendance/functions/report.functions";
import { getForgottenAttendanceFn } from "@/modules/attendance/functions/correction.functions";
import { getCardsFn, scanCardFn } from "@/modules/attendance/functions/card.functions";
import { getBranchQrFn } from "@/modules/attendance/functions/attendance.functions";
import { getCatalogFn } from "@/modules/services/functions/catalog.functions";
import { getDiscountSettingsFn } from "@/modules/services/functions/discount.functions";
import { getSessionFormFn } from "@/modules/services/functions/session.functions";
import { unbindPhoneFn } from "@/modules/staff/functions/phone.functions";
import { getTeamFn } from "@/modules/invitations/functions/invitation.functions";
const state = vi.hoisted(() => ({ query: vi.fn(), read: vi.fn() }));
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
vi.mock("@/lib/server/session.server", () => ({ requireUserId: async () => "manager" }));
vi.mock("@/lib/server/db.server", () => ({
  withUser: async (_id: string, run: (db: unknown) => unknown) => run({ query: state.query }),
}));
vi.mock("@/modules/services/domain/session-availability", () => ({
  serviceSessionRecordingAvailable: true,
}));
vi.mock("@/modules/attendance/persistence/report.server", () => ({
  readAttendanceReport: state.read,
}));
vi.mock("@/modules/attendance/persistence/correction-repository.server", () => ({
  listForgottenAttendance: state.read,
}));
vi.mock("@/modules/attendance/persistence/card-repository.server", () => ({
  readCardAccess: state.read,
  readCards: state.read,
  cardHash: async () => "f".repeat(64),
}));
vi.mock("@/modules/services/persistence/catalog.server", () => ({ pgCatalogReader: state.read }));
vi.mock("@/modules/services/persistence/discount.server", () => ({
  readDiscountSettings: state.read,
}));
vi.mock("@/modules/services/persistence/session.server", () => ({ readSessionForm: state.read }));
vi.mock("@/modules/attendance/persistence/qr-signer.server", () => ({ branchSigner: state.read }));
vi.mock("@/modules/invitations/persistence/invitation.server", () => ({ readTeam: state.read }));
const companyId = "40000000-0000-4000-8000-000000000001",
  expectedUserId = "manager";
beforeEach(() => {
  vi.clearAllMocks();
  state.query.mockResolvedValue({ rows: [{ allowed: false }] });
});
it("reports refuses reports.view deny before reading reports", async () => {
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
  expect(state.read).not.toHaveBeenCalled();
});
it("corrections refuses attendance.correct deny before reading records", async () => {
  await expect(getForgottenAttendanceFn({ data: { companyId } })).rejects.toThrow("FORBIDDEN");
  expect(state.read).not.toHaveBeenCalled();
});
it("cards management refuses staff.manage deny", async () => {
  await expect(getCardsFn({ data: { companyId, expectedUserId } })).rejects.toThrow("FORBIDDEN");
  expect(state.read).not.toHaveBeenCalled();
});
it("catalog preserves its null refusal response for services.manage deny", async () => {
  expect(await getCatalogFn({ data: { companyId, expectedUserId } })).toBeNull();
  expect(state.read).not.toHaveBeenCalled();
});
it("discounts refuses discounts.manage deny", async () => {
  await expect(getDiscountSettingsFn({ data: { companyId, expectedUserId } })).rejects.toThrow(
    "FORBIDDEN",
  );
  expect(state.read).not.toHaveBeenCalled();
});
it("sessions refuses pos.access deny when recording is available", async () => {
  await expect(getSessionFormFn({ data: { companyId } })).rejects.toThrow("FORBIDDEN");
  expect(state.read).not.toHaveBeenCalled();
});
it("reception card scanning rejects pos.access deny without saving a receipt", async () => {
  state.query.mockImplementation(async (sql: string) => {
    if (sql.includes("is_member")) return { rows: [{ member: true }] };
    if (sql.includes("has_permission")) return { rows: [{ allowed: false }] };
    return { rows: [] };
  });
  expect(
    await scanCardFn({
      data: {
        companyId,
        expectedUserId,
        requestId: companyId,
        requestedAt: Date.now(),
        token: "a".repeat(48),
        intent: null,
      },
    }),
  ).toEqual({ status: "rejected" });
  expect(state.read).not.toHaveBeenCalled();
  const statements = state.query.mock.calls.map(([sql]) => String(sql));
  expect(statements.some((sql) => sql.includes("insert into public.card_scan_requests"))).toBe(
    false,
  );
});
it("QR permission refusal prevents signing", async () => {
  state.query.mockResolvedValue({ rows: [] });
  await expect(getBranchQrFn({ data: { branchId: companyId } })).rejects.toThrow("FORBIDDEN");
  expect(state.read).not.toHaveBeenCalled();
  expect(state.query.mock.calls[0]?.[0]).toContain(
    "public.has_permission(b.company_id, 'pos.access')",
  );
});
it("phone unbinding refuses staff.manage deny before mutation", async () => {
  await expect(unbindPhoneFn({ data: { companyId, userId: "staff" } })).rejects.toThrow(
    "FORBIDDEN",
  );
  expect(state.query).toHaveBeenCalledOnce();
});
it("team listing refuses staff.manage deny before reading invitations", async () => {
  await expect(getTeamFn({ data: { companyId } })).rejects.toThrow("FORBIDDEN");
  expect(state.read).not.toHaveBeenCalled();
});
