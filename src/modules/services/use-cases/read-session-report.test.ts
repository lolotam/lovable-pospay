import { expect, it } from "vitest";
import { loadSessionReport } from "./read-session-report";

it("keeps other sessions in the report when a branch timezone cannot be resolved", async () => {
  const session = {
    name: "Employee",
    service: "Service",
    occurredAt: new Date("2026-11-18T23:59:00Z"),
    recordedAt: new Date("2026-11-19T00:01:00Z"),
    priceMills: 2000n,
    clientName: null,
  };
  const rows = await loadSessionReport(async () => [
    { ...session, id: "valid", timeZone: "UTC" },
    { ...session, id: "unknown", timeZone: "Not/AZone" },
  ]);
  expect(rows).toMatchObject([
    { id: "valid", late: true, timeZone: "UTC" },
    { id: "unknown", late: null, timeZone: "UTC" },
  ]);
});
