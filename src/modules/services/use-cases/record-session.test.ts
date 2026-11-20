import { describe, it, expect } from "vitest";
import { loadSessionForm, recordAvailableSession, recordSession } from "./record-session";
import { sessionRequestPayload } from "../domain/session-request";
import type { NewSession, SessionRepository } from "../ports/session-repository";
import type { DiscountApprovalRepository } from "../ports/discount-approval-repository";
import type { ApprovalRequestRecord } from "../domain/approval";

function fakeApprovalRequest(
  patch: Partial<ApprovalRequestRecord> = {},
): ApprovalRequestRecord & { createdAt: Date; requestedBy: string } {
  return {
    id: "req-remote",
    status: "approved",
    expiresAt: new Date("2026-11-18T09:05:00Z"),
    branchId: "b1",
    sessionId: "id1",
    serviceId: "s1",
    listPriceMills: 12500n,
    requestedPriceMills: 11000n,
    discountReason: "vip",
    approverName: "Manager",
    approverUserId: "manager-1",
    approvalId: "approval-1",
    approvalExpiresAt: new Date("2026-11-18T09:12:00Z"),
    approvalConsumedAt: null,
    createdAt: new Date("2026-11-18T09:00:00Z"),
    requestedBy: "reception-1",
    ...patch,
  };
}

function fake(
  opts: {
    assigned?: boolean;
    write?: boolean;
    cap?: number;
    claim?: "new" | "replay" | "conflict";
    monthClosed?: boolean;
    similar?: boolean;
    pin?: "approved" | "invalid";
  } = {},
) {
  const saved: NewSession[] = [];
  const clients: [string, string][] = [];
  const claims: [string, string][] = [];
  const calls: string[] = [];
  let audits = 0;
  const consumed: string[] = [];
  const repo: SessionRepository = {
    assignedService: async () => {
      calls.push("assigned");
      return opts.assigned === false
        ? null
        : { serviceName: "Hair", priceMills: 12500n, branchId: "b1", timeZone: "UTC" };
    },
    canWrite: async () => {
      calls.push("write");
      return opts.write !== false;
    },
    resolveTime: async (local) => new Date(`${local}Z`),
    claimRequest: async (id, payload) => {
      calls.push("claim");
      claims.push([id, payload]);
      return opts.claim ?? "new";
    },
    upsertClient: async (_branch, n, p) => {
      calls.push("client");
      clients.push([n, p]);
      return "c1";
    },
    discountCap: async () => opts.cap ?? 0,
    insertSession: async (s) => {
      calls.push("insert");
      saved.push(s);
    },
    audit: async () => {
      calls.push("audit");
      audits++;
    },
    isMonthClosed: async () => {
      calls.push("month");
      return opts.monthClosed === true;
    },
    hasSimilarSession: async () => {
      calls.push("similar");
      return opts.similar === true;
    },
    listBranchApprovers: async () => {
      calls.push("approvers");
      return [{ userId: "manager-1", name: "Manager" }];
    },
    verifyManagerPin: async () => {
      calls.push("verify");
      return opts.pin === "approved"
        ? { status: "approved", approvalId: "approval-1" }
        : { status: "invalid" };
    },
    consumeApproval: async (approvalId) => {
      calls.push("consume");
      consumed.push(approvalId);
    },
    getSessionForEdit: async () => null,
    canEditSession: async () => false,
    updateSession: async () => {},
    closeMonth: async () => {},
    listClosedMonths: async () => [],
    monthCloseStatus: async () => 0,
  };
  const approvals: DiscountApprovalRepository = {
    requestApproval: async () => {
      throw new Error("Unexpected requestApproval");
    },
    getRequest: async () => {
      calls.push("getRequest");
      return fakeApprovalRequest();
    },
    listPending: async () => [],
    decide: async () => {},
  };
  return {
    repo,
    approvals,
    saved,
    clients,
    claims,
    calls,
    consumed: () => consumed,
    audits: () => audits,
  };
}

const now = new Date("2026-11-18T09:00:00Z");
const input = {
  requestId: "id1",
  serviceId: "s1",
  staffId: "st1",
  clientName: " Noura ",
  clientPhone: "+965 5555 1234",
  occurredAt: "2026-11-18T08:00",
};

describe("recordSession", () => {
  it("records catalog price snapshot with client and staff", async () => {
    const f = fake();
    await expect(recordSession(f.repo, f.approvals, input, now)).resolves.toEqual({
      status: "saved",
      id: "id1",
      replayed: false,
    });
    expect(f.clients).toEqual([["Noura", "96555551234"]]);
    expect(f.saved[0]).toMatchObject({
      id: "id1",
      staffId: "st1",
      clientId: "c1",
      branchId: "b1",
      priceMills: 12500n,
      serviceName: "Hair",
      approvedBy: null,
      approvalId: null,
    });
  });

  it("claims and inserts one new request with the sent payload", async () => {
    const f = fake();
    await recordSession(f.repo, f.approvals, input, now);
    const payload = sessionRequestPayload({
      ...input,
      clientName: "Noura",
      normalizedPhone: "96555551234",
      priceMills: undefined,
    });
    expect(f.claims).toEqual([["id1", payload]]);
    expect(f.saved).toHaveLength(1);
    expect(f.saved[0]?.requestPayload).toBe(payload);
  });

  it("replays before assignment and permission lookups without any writes", async () => {
    const f = fake({ claim: "replay" });
    await expect(recordSession(f.repo, f.approvals, input, now)).resolves.toEqual({
      status: "saved",
      id: "id1",
      replayed: true,
    });
    expect(f.calls).toEqual(["claim"]);
    expect(f.clients).toEqual([]);
    expect(f.saved).toEqual([]);
    expect(f.audits()).toBe(0);
  });

  it("refuses a conflicting request before lookups and writes", async () => {
    const f = fake({ claim: "conflict" });
    await expect(recordSession(f.repo, f.approvals, input, now)).rejects.toThrow(
      "IDEMPOTENCY_CONFLICT",
    );
    expect(f.calls).toEqual(["claim"]);
    expect(f.clients).toEqual([]);
    expect(f.saved).toEqual([]);
    expect(f.audits()).toBe(0);
  });

  it("refuses a service not assigned to the employee", async () => {
    await expect(
      recordSession(fake({ assigned: false }).repo, fake().approvals, input, now),
    ).rejects.toThrow("NOT_ASSIGNED");
  });

  it("refuses a user without branch recording permission", async () => {
    const f = fake({ write: false });
    await expect(recordSession(f.repo, f.approvals, input, now)).rejects.toThrow("FORBIDDEN");
    expect(f.saved).toEqual([]);
  });

  it("refuses a session in the future", async () => {
    await expect(
      recordSession(
        fake().repo,
        fake().approvals,
        { ...input, occurredAt: "2026-11-18T09:01" },
        now,
      ),
    ).rejects.toThrow("FUTURE_SESSION");
  });

  it("refuses a session dated in a closed month (020 D2)", async () => {
    const f = fake({ monthClosed: true });
    await expect(recordSession(f.repo, f.approvals, input, now)).rejects.toThrow("PERIOD_CLOSED");
    expect(f.calls).not.toContain("similar");
    expect(f.saved).toEqual([]);
  });

  it("returns pin_required without any writes for an over-limit discount", async () => {
    const f = fake();
    await expect(
      recordSession(f.repo, f.approvals, { ...input, price: "12", discountReason: "vip" }, now),
    ).resolves.toEqual({
      status: "pin_required",
      approvers: [{ userId: "manager-1", name: "Manager" }],
    });
    expect(f.calls).toEqual(["claim", "assigned", "write", "month", "similar", "approvers"]);
    expect(f.saved).toEqual([]);
    expect(f.audits()).toBe(0);
  });

  it("returns pin_invalid without consuming anything when the PIN is wrong", async () => {
    const f = fake({ pin: "invalid" });
    await expect(
      recordSession(
        f.repo,
        f.approvals,
        {
          ...input,
          price: "12",
          discountReason: "vip",
          managerApproval: { kind: "pin", approverUserId: "manager-1", pin: "0000" },
        },
        now,
      ),
    ).resolves.toEqual({ status: "pin_invalid" });
    expect(f.calls).not.toContain("insert");
    expect(f.calls).not.toContain("consume");
  });

  it("saves an over-limit discount with the PIN approval and consumes it", async () => {
    const f = fake({ pin: "approved" });
    await expect(
      recordSession(
        f.repo,
        f.approvals,
        {
          ...input,
          price: "11",
          discountReason: "vip",
          managerApproval: { kind: "pin", approverUserId: "manager-1", pin: "1234" },
        },
        now,
      ),
    ).resolves.toEqual({ status: "saved", id: "id1", replayed: false });
    expect(f.saved[0]).toMatchObject({
      priceMills: 11000n,
      listPriceMills: 12500n,
      approvedBy: "manager-1",
      approvalId: "approval-1",
    });
    expect(f.consumed()).toEqual(["approval-1"]);
    expect(f.audits()).toBe(1);
  });

  it("saves an over-limit discount with a matching remote approval", async () => {
    const f = fake({ cap: 0 });
    await expect(
      recordSession(
        f.repo,
        f.approvals,
        {
          ...input,
          price: "11.000",
          discountReason: "vip",
          managerApproval: { kind: "remote", approvalRequestId: "req-remote" },
        },
        now,
      ),
    ).resolves.toEqual({ status: "saved", id: "id1", replayed: false });
    expect(f.saved[0]).toMatchObject({
      priceMills: 11000n,
      approvedBy: "manager-1",
      approvalId: "approval-1",
    });
  });

  it("reports an already used remote approval as used, not expired", async () => {
    const f = fake();
    f.approvals.getRequest = async () =>
      fakeApprovalRequest({ approvalConsumedAt: new Date("2026-11-18T09:03:00Z") });
    await expect(
      recordSession(
        f.repo,
        f.approvals,
        {
          ...input,
          price: "11.000",
          discountReason: "vip",
          managerApproval: { kind: "remote", approvalRequestId: "req-remote" },
        },
        now,
      ),
    ).resolves.toEqual({ status: "approval_unavailable", state: "used" });
    expect(f.saved).toEqual([]);
  });

  it("refuses a remote approval bound to another price", async () => {
    const f = fake();
    await expect(
      recordSession(
        f.repo,
        f.approvals,
        {
          ...input,
          price: "10.000",
          discountReason: "vip",
          managerApproval: { kind: "remote", approvalRequestId: "req-remote" },
        },
        now,
      ),
    ).resolves.toEqual({ status: "approval_unavailable", state: "mismatch" });
    expect(f.saved).toEqual([]);
  });

  it("warns about a similar session before any approval and saves after confirmation", async () => {
    const warned = fake({ similar: true });
    await expect(recordSession(warned.repo, warned.approvals, input, now)).resolves.toEqual({
      status: "duplicate_warning",
    });
    expect(warned.saved).toEqual([]);
    expect(warned.audits()).toBe(0);
    const confirmed = fake({ similar: true });
    await expect(
      recordSession(confirmed.repo, confirmed.approvals, { ...input, confirmDuplicate: true }, now),
    ).resolves.toEqual({ status: "saved", id: "id1", replayed: false });
    expect(confirmed.audits()).toBe(1);
  });

  it("records a discount within the granted limit with list price and reason", async () => {
    const f = fake({ cap: 10 });
    await recordSession(
      f.repo,
      f.approvals,
      { ...input, price: "11.250", discountReason: "vip" },
      now,
    );
    expect(f.saved[0]).toMatchObject({
      priceMills: 11250n,
      listPriceMills: 12500n,
      discountReason: "vip",
    });
  });

  it("keeps the kill switch closed without reading or recording", async () => {
    let reads = 0;
    await expect(
      loadSessionForm(async () => {
        reads++;
        return { canRecord: true, discountCap: 10, services: [], staff: [] };
      }, false),
    ).resolves.toEqual({ canRecord: false, discountCap: 0, services: [], staff: [] });
    expect(reads).toBe(0);
    await expect(
      recordAvailableSession(async () => ({ id: "id1", replayed: false }), false),
    ).rejects.toThrow("SESSION_RECORDING_UNAVAILABLE");
  });
});
