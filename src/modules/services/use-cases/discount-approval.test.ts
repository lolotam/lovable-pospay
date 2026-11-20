import { describe, expect, it } from "vitest";
import {
  decideDiscountApproval,
  getDiscountApprovalStatus,
  listPendingDiscountApprovals,
  requestDiscountApproval,
} from "./discount-approval";
import type { SessionRepository } from "../ports/session-repository";
import type { DiscountApprovalRepository } from "../ports/discount-approval-repository";

const now = new Date("2027-03-10T12:00:00Z");

function fakeRepo(servicePriceMills: bigint) {
  const calls: string[] = [];
  const repo: SessionRepository = {
    assignedService: async (serviceId, staffId) => {
      calls.push(`assigned:${serviceId}:${staffId}`);
      return staffId === "staff-none"
        ? null
        : { serviceName: "Hair", priceMills: servicePriceMills, branchId: "b1", timeZone: "UTC" };
    },
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
    closeMonth: async () => {},
    listClosedMonths: async () => [],
    monthCloseStatus: async () => 0,
  };
  return { repo, calls };
}

function fakeApprovals() {
  const calls: string[] = [];
  const repo: DiscountApprovalRepository = {
    requestApproval: async (input) => {
      calls.push(`request:${input.sessionId}:${input.listPriceMills}:${input.priceMills}`);
      return { id: "req-1" };
    },
    getRequest: async () => null,
    listPending: async () => {
      calls.push("pending");
      return [];
    },
    decide: async (_requestId, approve) => {
      calls.push(`decide:${approve}`);
    },
  };
  return { repo, calls };
}

describe("requestDiscountApproval (020 B4.1)", () => {
  it("creates a pending request below the list price", async () => {
    const repo = fakeRepo(100000n);
    const approvals = fakeApprovals();
    await expect(
      requestDiscountApproval(repo.repo, approvals.repo, {
        sessionId: "session-1",
        serviceId: "s1",
        staffId: "staff-1",
        price: "85.000",
        discountReason: " vip ",
      }),
    ).resolves.toEqual({ id: "req-1" });
    expect(approvals.calls).toEqual(["request:session-1:100000:85000"]);
  });

  it("binds the request to the stored list price when provided (020 D3)", async () => {
    const repo = fakeRepo(200000n);
    const approvals = fakeApprovals();
    await requestDiscountApproval(repo.repo, approvals.repo, {
      sessionId: "session-1",
      serviceId: "s1",
      staffId: "staff-1",
      price: "85.000",
      listPrice: "100.000",
      discountReason: "vip",
    });
    expect(approvals.calls).toEqual(["request:session-1:100000:85000"]);
    await expect(
      requestDiscountApproval(repo.repo, approvals.repo, {
        sessionId: "session-1",
        serviceId: "s1",
        staffId: "staff-1",
        price: "150.000",
        listPrice: "100.000",
        discountReason: "vip",
      }),
    ).rejects.toThrow("INVALID_PRICE");
  });

  it("refuses a price at or above the list and a missing assignment", async () => {
    const repo = fakeRepo(100000n);
    const approvals = fakeApprovals();
    await expect(
      requestDiscountApproval(repo.repo, approvals.repo, {
        sessionId: "session-1",
        serviceId: "s1",
        staffId: "staff-1",
        price: "100.000",
        discountReason: "vip",
      }),
    ).rejects.toThrow("INVALID_PRICE");
    await expect(
      requestDiscountApproval(repo.repo, approvals.repo, {
        sessionId: "session-1",
        serviceId: "s1",
        staffId: "staff-none",
        price: "85.000",
        discountReason: "vip",
      }),
    ).rejects.toThrow("NOT_ASSIGNED");
    await expect(
      requestDiscountApproval(repo.repo, approvals.repo, {
        sessionId: "session-1",
        serviceId: "s1",
        staffId: "staff-1",
        price: "85.000",
        discountReason: "  ",
      }),
    ).rejects.toThrow("DISCOUNT_REASON_REQUIRED");
    expect(approvals.calls).toEqual([]);
  });
});

describe("approval status, list and decide (020 B4.2/B4.3)", () => {
  it("returns null when the request is not visible to the requester", async () => {
    const approvals = fakeApprovals();
    await expect(getDiscountApprovalStatus(approvals.repo, "req-x", now)).resolves.toBeNull();
  });

  it("lists pending requests and decides by delegation", async () => {
    const approvals = fakeApprovals();
    await listPendingDiscountApprovals(approvals.repo, "company-1");
    await decideDiscountApproval(approvals.repo, "req-1", true);
    await decideDiscountApproval(approvals.repo, "req-2", false);
    expect(approvals.calls).toEqual(["pending", "decide:true", "decide:false"]);
  });
});
