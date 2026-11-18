import { expect, it, vi } from "vitest";
import { loadCompanyOverview, loadOwnOverview, loadPlatformOverview } from "./load-overview";
import type { SessionContextRepository } from "../ports/session-context-repository";
import type { OverviewReader } from "../ports/overview-reader";
const companyId = "40000000-0000-4000-8000-000000000001",
  branchId = "40000000-0000-4000-8000-000000000002";
const user = { id: "mona", name: "Mona", email: "mona@example.test" };
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
      branchName: "Nails",
    },
    {
      kind: "company",
      companyId,
      companyName: "Salon",
      businessType: "salon",
      role: "staff",
      branchId,
      branchName: "Nails",
    },
  ],
};
const reader = (): OverviewReader => ({
  platform: vi.fn().mockResolvedValue({ companies: "2", users: "3" }),
  company: vi.fn().mockResolvedValue({ present: "1", exceptions: "0", staff: "2" }),
  own: vi.fn().mockResolvedValue({ attendance: "open", bound: true }),
});
it("orchestrates company counts only in the active branch", async () => {
  const r = reader();
  expect(
    await loadCompanyOverview(
      repo,
      r,
      user,
      { kind: "company", companyId, role: "branch_manager" },
      companyId,
    ),
  ).toEqual({ present: "1", exceptions: "0", staff: "2" });
  expect(r.company).toHaveBeenCalledWith(companyId, branchId);
});
it("does not read data for a foreign company or staff company-dashboard request", async () => {
  const r = reader();
  await expect(
    loadCompanyOverview(repo, r, user, { kind: "company", companyId, role: "staff" }, companyId),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    loadCompanyOverview(
      repo,
      r,
      user,
      { kind: "company", companyId, role: "branch_manager" },
      branchId,
    ),
  ).rejects.toThrow("FORBIDDEN");
  expect(r.company).not.toHaveBeenCalled();
});
it("shows only the active staff own attendance and phone state", async () => {
  const r = reader();
  expect(
    await loadOwnOverview(repo, r, user, { kind: "company", companyId, role: "staff" }, companyId),
  ).toEqual({ attendance: "open", bound: true });
  await expect(
    loadOwnOverview(
      repo,
      r,
      user,
      { kind: "company", companyId, role: "branch_manager" },
      companyId,
    ),
  ).rejects.toThrow("FORBIDDEN");
  expect(r.own).toHaveBeenCalledOnce();
});
it("loads platform counts through the authorized reader only", async () => {
  await expect(loadPlatformOverview(reader())).resolves.toEqual({ companies: "2", users: "3" });
});
