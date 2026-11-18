import { expect, it, vi } from "vitest";
import { settleCardScanFn } from "./card.functions";

const { lockAndRead, save, requireUserId } = vi.hoisted(() => ({
  lockAndRead: vi.fn(),
  save: vi.fn(),
  requireUserId: vi.fn().mockResolvedValue("reception"),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    inputValidator: (validate: (input: unknown) => unknown) => ({
      handler:
        (handler: (args: { data: unknown }) => unknown) =>
        ({ data }: { data: unknown }) =>
          handler({ data: validate(data) }),
    }),
  }),
}));
vi.mock("@/lib/server/session.server", () => ({
  requireUserId,
}));
vi.mock("@/lib/server/db.server", () => ({
  withUser: async (_userId: string, run: (db: unknown) => unknown) =>
    run({ query: async () => ({ rows: [{ member: true }] }) }),
}));
vi.mock("../persistence/card-scan-receipts.server", () => ({
  pgCardScanReceipts: () => ({ lockAndRead, save }),
}));

it("waits for the original scan receipt when recovery crosses the request age limit", async () => {
  const requestedAt = Date.parse("2026-11-01T00:00:00Z");
  const limit = 7 * 24 * 60 * 60_000 + 5 * 60_000;
  const clock = vi.spyOn(Date, "now").mockReturnValue(requestedAt + limit - 1);
  const result = {
    status: "recorded",
    scan: { name: "Employee", result: { outcome: "checked_in" } },
  };
  const data = {
    companyId: "30000000-0000-4000-8000-000000000001",
    expectedUserId: "reception",
    requestId: "30000000-0000-4000-8000-000000000002",
    requestedAt,
  };
  let releaseReceipt!: (receipt: unknown) => void;
  lockAndRead
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseReceipt = resolve;
        }),
    )
    .mockResolvedValueOnce(undefined);
  try {
    const recovery = settleCardScanFn({ data });
    await vi.waitFor(() => expect(lockAndRead).toHaveBeenCalledOnce());
    expect(save).not.toHaveBeenCalled();
    clock.mockReturnValue(requestedAt + limit);
    releaseReceipt({ fingerprint: "original", result });
    await expect(recovery).resolves.toEqual(result);
    expect(save).not.toHaveBeenCalled();
    await expect(settleCardScanFn({ data })).resolves.toEqual({ status: "rejected" });
    expect(save).toHaveBeenCalledExactlyOnceWith({
      fingerprint: null,
      result: { status: "rejected" },
    });
  } finally {
    clock.mockRestore();
  }
});

it("identifies an expired session before parsing the recovery payload", async () => {
  requireUserId.mockRejectedValueOnce(new Error("UNAUTHENTICATED"));
  const data = { companyId: "", expectedUserId: "", requestId: "", requestedAt: 0 };
  await expect(settleCardScanFn({ data })).resolves.toEqual({ status: "unverified" });
  await expect(settleCardScanFn({ data })).rejects.toMatchObject({ name: "ZodError" });
});

it("settles an attempt from a fast workstation without waiting for its old clock", async () => {
  lockAndRead.mockReset().mockResolvedValueOnce(undefined);
  save.mockClear();
  const data = {
    companyId: "30000000-0000-4000-8000-000000000001",
    expectedUserId: "reception",
    requestId: "30000000-0000-4000-8000-000000000003",
    requestedAt: Date.now() + 60 * 60_000,
  };
  await expect(settleCardScanFn({ data })).resolves.toEqual({ status: "clock_invalid" });
  expect(save).toHaveBeenCalledExactlyOnceWith({
    fingerprint: null,
    result: { status: "clock_invalid" },
  });
});
