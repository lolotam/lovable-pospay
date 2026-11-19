import { expect, it, vi } from "vitest";
import { loadCompanyCharts, loadGrowth, loadMyStrip } from "./load-company-charts";
import type { SessionContextRepository } from "../ports/session-context-repository";
import type { ChartReader } from "../ports/chart-reader";
const companyId = "90000000-0000-4000-8000-000000000001",
  branchId = "90000000-0000-4000-8000-000000000002";
const user = { id: "manager", name: "Manager", email: "manager@example.test" };
const repo: SessionContextRepository = {
  isPlatformAdmin: async () => false,
  listOverrides: async () => [],
  listCompanyWorkspaces: async () => [
    {
      kind: "company",
      companyId,
      companyName: "Salon",
      businessType: "salon",
      role: "branch_manager",
      branchId,
      branchName: "A",
    },
  ],
};
const reader: ChartReader = {
  company: vi.fn(async () => ({ attendance: [], lateLeaders: [], sessions: null })),
  own: vi.fn(async () => []),
  platform: vi.fn(async () => []),
};
const remembered = { kind: "company", companyId, role: "branch_manager" } as const;
it("uses the active manager branch and leaves sessions disabled", async () => {
  await loadCompanyCharts(repo, reader, user, remembered, companyId, 14, false);
  expect(reader.company).toHaveBeenLastCalledWith(companyId, branchId, 14, false);
});
it("denied reports cannot read charts even with a manager role", async () => {
  await expect(
    loadCompanyCharts(
      { ...repo, listOverrides: async () => [{ permission: "reports.view", effect: "deny" }] },
      reader,
      user,
      remembered,
      companyId,
      14,
      false,
    ),
  ).rejects.toThrow("FORBIDDEN");
});
it("refuses a foreign company", async () => {
  await expect(
    loadCompanyCharts(repo, reader, user, remembered, branchId, 14, false),
  ).rejects.toThrow("FORBIDDEN");
});
it("refuses platform growth for a non-admin", async () => {
  await expect(loadGrowth(repo, reader)).rejects.toThrow("FORBIDDEN");
});
it("loads only the active company for personal attendance", async () => {
  await loadMyStrip(repo, reader, user, remembered);
  expect(reader.own).toHaveBeenLastCalledWith(companyId);
});
