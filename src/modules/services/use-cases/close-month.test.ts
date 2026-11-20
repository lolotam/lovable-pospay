import { describe, expect, it } from "vitest";
import { closeMonth } from "./close-month";
import type { SessionRepository } from "../ports/session-repository";

function fakeRepo(daysRemaining: number) {
  const calls: string[] = [];
  const repo: SessionRepository = {
    assignedService: async () => null,
    canWrite: async () => false,
    resolveTime: async (local) => new Date(`${local}Z`),
    claimRequest: async () => "new",
    upsertClient: async () => "c1",
    discountCap: async () => 0,
    insertSession: async () => {},
    audit: async () => {},
    isMonthClosed: async () => false,
    hasSimilarSession: async () => false,
    listBranchApprovers: async () => [],
    verifyManagerPin: async () => ({ status: "invalid" }),
    consumeApproval: async () => {},
    getSessionForEdit: async () => null,
    canEditSession: async () => false,
    updateSession: async () => {},
    closeMonth: async (periodMonth, note) => {
      calls.push(`close:${periodMonth}:${note ?? ""}`);
    },
    listClosedMonths: async () => [],
    monthCloseStatus: async () => {
      calls.push("status");
      return daysRemaining;
    },
  };
  return { repo, calls };
}

describe("closeMonth (020 D2)", () => {
  it("closes an ended month directly", async () => {
    const f = fakeRepo(0);
    await closeMonth(f.repo, { periodMonth: "2027-02-01" });
    expect(f.calls).toEqual(["status", "close:2027-02-01:"]);
  });

  it("refuses a not-ended month without the explicit confirmation", async () => {
    const f = fakeRepo(12);
    await expect(closeMonth(f.repo, { periodMonth: "2027-03-01" })).rejects.toThrow(
      "MONTH_NOT_ENDED_CONFIRMATION_REQUIRED",
    );
    expect(f.calls).toEqual(["status"]);
  });

  it("closes a not-ended month with the explicit confirmation and a trimmed note", async () => {
    const f = fakeRepo(3);
    await closeMonth(f.repo, {
      periodMonth: "2027-03-01",
      note: "  تقفيل مبكر  ",
      confirmUnfinishedMonth: true,
    });
    expect(f.calls).toEqual(["status", "close:2027-03-01:تقفيل مبكر"]);
  });
});
