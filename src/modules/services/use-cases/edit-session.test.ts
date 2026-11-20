import { describe, expect, it } from "vitest";
import { editSession } from "./edit-session";
import type { SessionForEdit, SessionRepository } from "../ports/session-repository";
import type { DiscountApprovalRepository } from "../ports/discount-approval-repository";

const now = new Date("2027-03-10T12:00:00Z");

function fakeRepo(
  opts: {
    existing?: SessionForEdit | null;
    canEdit?: boolean;
    monthClosed?: boolean;
    pin?: "approved" | "invalid";
    cap?: number;
  } = {},
) {
  const calls: string[] = [];
  const updates: unknown[] = [];
  const repo: SessionRepository = {
    assignedService: async (serviceId, staffId) => {
      calls.push(`assigned:${serviceId}:${staffId}`);
      if (serviceId === "s-none" || staffId === "staff-none") return null;
      if (staffId === "staff-2")
        return { serviceName: "Hair", priceMills: 12500n, branchId: "b2", timeZone: "UTC" };
      return { serviceName: "Hair", priceMills: 12500n, branchId: "b1", timeZone: "UTC" };
    },
    canWrite: async () => {
      calls.push("write");
      return true;
    },
    resolveTime: async (local) => new Date(`${local}Z`),
    claimRequest: async () => "new",
    upsertClient: async () => "c1",
    discountCap: async () => opts.cap ?? 0,
    insertSession: async () => {},
    audit: async () => {},
    isMonthClosed: async (_branch, at) =>
      opts.monthClosed === true ? true : at.getUTCDate() === 31,
    hasSimilarSession: async () => false,
    listBranchApprovers: async (branchId) => {
      calls.push(`approvers:${branchId}`);
      return [{ userId: `manager-${branchId}`, name: "Manager" }];
    },
    verifyManagerPin: async () => {
      calls.push("verify");
      return opts.pin === "approved"
        ? { status: "approved", approvalId: "approval-new" }
        : { status: "invalid" };
    },
    consumeApproval: async () => {},
    getSessionForEdit: async () => {
      calls.push("get");
      return opts.existing === undefined
        ? {
            id: "session-1",
            serviceId: "s1",
            serviceName: "Hair",
            staffId: "staff-1",
            branchId: "b1",
            timeZone: "UTC",
            clientName: "Noura",
            occurredAt: new Date("2027-03-01T10:00:00Z"),
            listPriceMills: 12500n,
            priceMills: 11000n,
            discountReason: "vip",
            approvedBy: "manager-b1",
            monthClosed: false,
            canEdit: true,
          }
        : (opts.existing ?? null);
    },
    canEditSession: async () => {
      calls.push("canEdit");
      return opts.canEdit !== false;
    },
    updateSession: async (edit) => {
      calls.push("update");
      updates.push(edit);
    },
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
      return {
        id: "req-remote",
        status: "approved",
        expiresAt: new Date("2027-03-10T12:05:00Z"),
        branchId: "b1",
        sessionId: "session-1",
        serviceId: "s1",
        listPriceMills: 12500n,
        requestedPriceMills: 11000n,
        discountReason: "vip",
        approverName: "Manager",
        approverUserId: "manager-b1",
        approvalId: "approval-remote",
        approvalExpiresAt: new Date("2027-03-10T12:15:00Z"),
        approvalConsumedAt: null,
        createdAt: new Date("2027-03-10T11:00:00Z"),
        requestedBy: "reception-1",
      };
    },
    listPending: async () => [],
    decide: async () => {},
  };
  return { repo, approvals, calls, updates: () => updates };
}

const baseInput = {
  sessionId: "session-1",
  serviceId: "s1",
  staffId: "staff-1",
  clientName: "Noura",
  occurredAt: "2027-03-01T10:00",
  price: "11.000",
  discountReason: "vip",
  editReason: "اختيار خاطئ",
};

describe("editSession (020 D3/D4)", () => {
  it("refuses a session outside the editor's scope", async () => {
    const missing = fakeRepo({ existing: null });
    await expect(editSession(missing.repo, missing.approvals, baseInput, now)).rejects.toThrow(
      "FORBIDDEN",
    );
    const locked = fakeRepo({
      existing: {
        id: "session-1",
        serviceId: "s1",
        serviceName: "Hair",
        staffId: "staff-1",
        branchId: "b1",
        timeZone: "UTC",
        clientName: "Noura",
        occurredAt: new Date("2027-03-01T10:00:00Z"),
        listPriceMills: 12500n,
        priceMills: 11000n,
        discountReason: "vip",
        approvedBy: null,
        monthClosed: false,
        canEdit: false,
      },
    });
    await expect(editSession(locked.repo, locked.approvals, baseInput, now)).rejects.toThrow(
      "FORBIDDEN",
    );
    expect(locked.updates()).toEqual([]);
  });

  it("reports PERIOD_CLOSED for a session whose recorded month is closed", async () => {
    const f = fakeRepo({
      existing: {
        id: "session-1",
        serviceId: "s1",
        serviceName: "Hair",
        staffId: "staff-1",
        branchId: "b1",
        timeZone: "UTC",
        clientName: "Noura",
        occurredAt: new Date("2027-02-01T10:00:00Z"),
        listPriceMills: 12500n,
        priceMills: 11000n,
        discountReason: "vip",
        approvedBy: null,
        monthClosed: true,
        canEdit: false,
      },
    });
    await expect(editSession(f.repo, f.approvals, baseInput, now)).rejects.toThrow("PERIOD_CLOSED");
    expect(f.updates()).toEqual([]);
  });

  it("refuses a missing session and an unassigned service", async () => {
    const missing = fakeRepo({ existing: null });
    await expect(editSession(missing.repo, missing.approvals, baseInput, now)).rejects.toThrow(
      "FORBIDDEN",
    );
    const unassigned = fakeRepo();
    await expect(
      editSession(
        unassigned.repo,
        unassigned.approvals,
        { ...baseInput, serviceId: "s-none" },
        now,
      ),
    ).rejects.toThrow("NOT_ASSIGNED");
  });

  it("refuses an empty edit reason and a closed month on the new timestamp", async () => {
    const f = fakeRepo();
    await expect(
      editSession(f.repo, f.approvals, { ...baseInput, editReason: "  " }, now),
    ).rejects.toThrow("EDIT_REASON_REQUIRED");
    await expect(
      editSession(f.repo, f.approvals, { ...baseInput, occurredAt: "2027-01-31T10:00" }, now),
    ).rejects.toThrow("PERIOD_CLOSED");
    await expect(
      editSession(f.repo, f.approvals, { ...baseInput, occurredAt: "2027-03-10T12:01" }, now),
    ).rejects.toThrow("FUTURE_SESSION");
  });

  it("requires the phone when the client name changes (020 D3)", async () => {
    const f = fakeRepo();
    await expect(
      editSession(f.repo, f.approvals, { ...baseInput, clientName: "Noura Ali" }, now),
    ).rejects.toThrow("CLIENT_PHONE_REQUIRED");
    await expect(
      editSession(
        f.repo,
        f.approvals,
        { ...baseInput, clientName: "Noura Ali", clientPhone: "96555551234" },
        now,
      ),
    ).resolves.toEqual({ status: "saved", sessionId: "session-1" });
    expect(f.updates()[0]).toMatchObject({ clientPhone: "96555551234" });
  });

  it("keeps the existing approval when only the staff member changes within the branch", async () => {
    const f = fakeRepo();
    await expect(
      editSession(f.repo, f.approvals, { ...baseInput, staffId: "staff-1b" }, now),
    ).resolves.toEqual({ status: "saved", sessionId: "session-1" });
    expect(f.updates()[0]).toMatchObject({ approvalId: null, staffId: "staff-1b" });
    expect(f.calls).not.toContain("verify");
  });

  it("requires a new-branch approval when the staff member moves to another branch", async () => {
    const f = fakeRepo();
    await expect(
      editSession(f.repo, f.approvals, { ...baseInput, staffId: "staff-2" }, now),
    ).resolves.toEqual({
      status: "pin_required",
      approvers: [{ userId: "manager-b2", name: "Manager" }],
    });
    expect(f.updates()).toEqual([]);
  });

  it("saves a branch move with a fresh PIN approval from the new branch", async () => {
    const f = fakeRepo({ pin: "approved" });
    await expect(
      editSession(
        f.repo,
        f.approvals,
        {
          ...baseInput,
          staffId: "staff-2",
          managerApproval: { kind: "pin", approverUserId: "manager-b2", pin: "1234" },
        },
        now,
      ),
    ).resolves.toEqual({ status: "saved", sessionId: "session-1" });
    expect(f.updates()[0]).toMatchObject({ approvalId: "approval-new", staffId: "staff-2" });
  });

  it("returns pin_invalid without writing when the PIN is wrong", async () => {
    const f = fakeRepo({ pin: "invalid" });
    await expect(
      editSession(
        f.repo,
        f.approvals,
        {
          ...baseInput,
          staffId: "staff-2",
          managerApproval: { kind: "pin", approverUserId: "manager-b2", pin: "0000" },
        },
        now,
      ),
    ).resolves.toEqual({ status: "pin_invalid" });
    expect(f.updates()).toEqual([]);
  });

  it("refuses a remote approval bound to a different price", async () => {
    const f = fakeRepo();
    await expect(
      editSession(
        f.repo,
        f.approvals,
        {
          ...baseInput,
          price: "10.000",
          managerApproval: { kind: "remote", approvalRequestId: "req-remote" },
        },
        now,
      ),
    ).resolves.toEqual({ status: "approval_unavailable", state: "mismatch" });
    expect(f.updates()).toEqual([]);
  });

  it("keeps the recorded list price when the service is unchanged and takes the catalog price on change", async () => {
    const f = fakeRepo();
    await editSession(f.repo, f.approvals, baseInput, now);
    expect(f.updates()[0]).toMatchObject({ discountReason: "vip" });
    const changed = fakeRepo({ cap: 100 });
    await expect(
      editSession(changed.repo, changed.approvals, { ...baseInput, price: "12.500" }, now),
    ).resolves.toEqual({ status: "saved", sessionId: "session-1" });
  });
});
