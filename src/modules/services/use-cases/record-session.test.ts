import { describe, it, expect } from "vitest";
import { recordSession } from "./record-session";
import type { SessionRepository, NewSession } from "../ports/session-repository";
function fake(opts: { assigned?: boolean; write?: boolean; cap?: number } = {}) {
  const saved: NewSession[] = [];
  const clients: [string, string][] = [];
  const repo: SessionRepository = {
    assignedService: async () =>
      opts.assigned === false ? null : { serviceName: "Hair", priceMills: 12500n, branchId: "b1" },
    canWrite: async () => opts.write !== false,
    discountCap: async () => opts.cap ?? 0,
    upsertClient: async (n, p) => (clients.push([n, p]), "c1"),
    insertSession: async (s) => void saved.push(s),
    audit: async () => undefined,
  };
  return { repo, saved, clients };
}
const now = new Date("2026-11-18T09:00:00Z");
const input = {
  serviceId: "s1",
  staffId: "st1",
  clientName: " Noura ",
  clientPhone: "+965 5555 1234",
  occurredAt: new Date("2026-11-18T08:00:00Z"),
};
describe("recordSession", () => {
  it("records catalog price snapshot with client and staff", async () => {
    const f = fake();
    await recordSession(f.repo, input, now, () => "id1");
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
  it("refuses a service not assigned to the employee", async () => {
    await expect(
      recordSession(fake({ assigned: false }).repo, input, now, () => "x"),
    ).rejects.toThrow("NOT_ASSIGNED");
  });
  it("refuses a user without branch recording permission", async () => {
    const f = fake({ write: false });
    await expect(recordSession(f.repo, input, now, () => "x")).rejects.toThrow("FORBIDDEN");
    expect(f.saved).toEqual([]);
  });
  it("refuses a session in the future", async () => {
    await expect(
      recordSession(
        fake().repo,
        { ...input, occurredAt: new Date("2026-11-18T10:00:00Z") },
        now,
        () => "x",
      ),
    ).rejects.toThrow("FUTURE_SESSION");
  });
  it("refuses a discount when the user has no grant", async () => {
    const f = fake();
    await expect(
      recordSession(
        f.repo,
        { ...input, priceMills: 12000n, discountReason: "vip" },
        now,
        () => "i",
      ),
    ).rejects.toThrow("DISCOUNT_OVER_LIMIT");
  });
  it("records a discount within the granted limit with list price and reason", async () => {
    const f = fake({ cap: 10 });
    await recordSession(
      f.repo,
      { ...input, priceMills: 11250n, discountReason: "vip" },
      now,
      () => "i",
    );
    expect(f.saved[0]).toMatchObject({
      priceMills: 11250n,
      listPriceMills: 12500n,
      discountReason: "vip",
    });
  });
});
