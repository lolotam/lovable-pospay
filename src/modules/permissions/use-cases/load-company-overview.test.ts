import { expect, it } from "vitest";
import { companyOverviewScope } from "./load-company-overview";
import type { SessionContextRepository } from "../ports/session-context-repository";
const companyId = "40000000-0000-4000-8000-000000000001",
  branchId = "40000000-0000-4000-8000-000000000002";
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
      branchName: "Branch",
    },
    {
      kind: "company",
      companyId,
      companyName: "Salon",
      businessType: "salon",
      role: "owner",
      branchId: null,
      branchName: null,
    },
  ],
};
it("narrows a branch manager even when the account also owns the salon", async () => {
  await expect(
    companyOverviewScope(repo, companyId, { kind: "company", companyId, role: "branch_manager" }),
  ).resolves.toBe(branchId);
  await expect(
    companyOverviewScope(repo, companyId, { kind: "company", companyId, role: "owner" }),
  ).resolves.toBeNull();
});
it("refuses foreign company or unheld role for dashboard counts", async () => {
  await expect(
    companyOverviewScope(repo, companyId, { kind: "company", companyId, role: "reception" }),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    companyOverviewScope(repo, branchId, { kind: "company", companyId: branchId, role: "owner" }),
  ).rejects.toThrow("FORBIDDEN");
});
