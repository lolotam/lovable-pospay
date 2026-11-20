import { describe, expect, it } from "vitest";
import { approvalMatches, approvalRequestState } from "./approval";
import type { ApprovalRequestRecord } from "./approval";

const baseRequest: ApprovalRequestRecord = {
  id: "req-1",
  status: "pending",
  expiresAt: new Date("2027-03-10T14:05:00Z"),
  branchId: "b1",
  sessionId: "s1",
  serviceId: "svc1",
  listPriceMills: 100000n,
  requestedPriceMills: 85000n,
  discountReason: "vip",
  approverName: null,
  approverUserId: null,
  approvalId: null,
  approvalExpiresAt: null,
  approvalConsumedAt: null,
};

describe("approvalRequestState (020 B4.4)", () => {
  it("waits while pending and unexpired", () => {
    expect(approvalRequestState(baseRequest, new Date("2027-03-10T14:04:59Z"))).toBe("waiting");
  });
  it("expires a pending request past its window", () => {
    expect(approvalRequestState(baseRequest, new Date("2027-03-10T14:05:00Z"))).toBe("expired");
  });
  it("shows approved while the approval is live and unused", () => {
    const request = {
      ...baseRequest,
      status: "approved" as const,
      approverName: "Manager",
      approvalId: "ap-1",
      approvalExpiresAt: new Date("2027-03-10T14:12:00Z"),
    };
    expect(approvalRequestState(request, new Date("2027-03-10T14:10:00Z"))).toBe("approved");
    expect(
      approvalRequestState(
        { ...request, approvalConsumedAt: new Date("2027-03-10T14:09:00Z") },
        new Date("2027-03-10T14:10:00Z"),
      ),
    ).toBe("expired");
    expect(
      approvalRequestState(
        { ...request, approvalExpiresAt: new Date("2027-03-10T14:09:59Z") },
        new Date("2027-03-10T14:10:00Z"),
      ),
    ).toBe("expired");
  });
  it("maps rejected and superseded states", () => {
    expect(approvalRequestState({ ...baseRequest, status: "rejected" }, new Date())).toBe(
      "rejected",
    );
    expect(approvalRequestState({ ...baseRequest, status: "superseded" }, new Date())).toBe(
      "expired",
    );
  });
});

describe("approvalMatches (020 B4.5)", () => {
  const payload = {
    branchId: "b1",
    sessionId: "s1",
    serviceId: "svc1",
    listPriceMills: 100000n,
    priceMills: 85000n,
  };
  it("matches an identical binding", () => {
    expect(approvalMatches(baseRequest, payload)).toBe(true);
  });
  it.each([
    { name: "branch", patch: { branchId: "b2" } },
    { name: "session", patch: { sessionId: "s2" } },
    { name: "service", patch: { serviceId: "svc2" } },
    { name: "list price", patch: { listPriceMills: 90000n } },
    { name: "price", patch: { requestedPriceMills: 80000n } },
  ])("refuses a mismatch on $name", ({ patch }) => {
    expect(approvalMatches({ ...baseRequest, ...patch }, payload)).toBe(false);
  });
});
