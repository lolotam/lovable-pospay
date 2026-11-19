import { describe, it, expect } from "vitest";
import { loadSessionForm, recordAvailableSession, recordSession } from "./record-session";
import { sessionRequestPayload } from "../domain/session-request";
import type { SessionRepository, NewSession } from "../ports/session-repository";

function fake(
  opts: {
    assigned?: boolean;
    write?: boolean;
    cap?: number;
    claim?: "new" | "replay" | "conflict";
  } = {},
) {
  const saved: NewSession[] = [];
  const clients: [string, string][] = [];
  const claims: [string, string][] = [];
  const calls: string[] = [];
  let audits = 0;
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
  };
  return { repo, saved, clients, claims, calls, audits: () => audits };
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
    await expect(recordSession(f.repo, input, now)).resolves.toEqual({
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
    });
  });

  it("claims and inserts one new request with the sent payload", async () => {
    const f = fake();
    await recordSession(f.repo, input, now);
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
    await expect(recordSession(f.repo, input, now)).resolves.toEqual({
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
    await expect(recordSession(f.repo, input, now)).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    expect(f.calls).toEqual(["claim"]);
    expect(f.clients).toEqual([]);
    expect(f.saved).toEqual([]);
    expect(f.audits()).toBe(0);
  });

  it("refuses a service not assigned to the employee", async () => {
    await expect(recordSession(fake({ assigned: false }).repo, input, now)).rejects.toThrow(
      "NOT_ASSIGNED",
    );
  });

  it("refuses a user without branch recording permission", async () => {
    const f = fake({ write: false });
    await expect(recordSession(f.repo, input, now)).rejects.toThrow("FORBIDDEN");
    expect(f.saved).toEqual([]);
  });

  it("refuses a session in the future", async () => {
    await expect(
      recordSession(fake().repo, { ...input, occurredAt: "2026-11-18T09:01" }, now),
    ).rejects.toThrow("FUTURE_SESSION");
  });

  it("refuses a discount when the user has no grant", async () => {
    const f = fake();
    await expect(
      recordSession(f.repo, { ...input, price: "12", discountReason: "vip" }, now),
    ).rejects.toThrow("DISCOUNT_OVER_LIMIT");
  });

  it("records a discount within the granted limit with list price and reason", async () => {
    const f = fake({ cap: 10 });
    await recordSession(f.repo, { ...input, price: "11.250", discountReason: "vip" }, now);
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
