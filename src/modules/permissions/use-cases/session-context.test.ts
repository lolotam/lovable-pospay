import { describe, expect, it } from "vitest";
import type { SessionContextRepository } from "../ports/session-context-repository";
import type { WorkspaceDto } from "../contracts";
import { loadSessionContext } from "./load-session-context";
import { selectWorkspace } from "./select-workspace";
const user = { id: "mona", name: "Mona", email: "mona@example.test" };
const company = (
  role: "owner" | "staff" | "branch_manager",
  companyId = "40000000-0000-4000-8000-000000000001",
): Extract<WorkspaceDto, { kind: "company" }> => ({
  kind: "company",
  companyId,
  companyName: "Salon",
  businessType: "salon",
  role,
  branchId: null,
  branchName: null,
});
const repo = (
  workspaces: Extract<WorkspaceDto, { kind: "company" }>[] = [],
  admin = false,
): SessionContextRepository => ({
  listCompanyWorkspaces: async () => workspaces,
  isPlatformAdmin: async () => admin,
  listOverrides: async () => [
    { permission: "reports.view", effect: "deny" },
    { permission: "pos.access", effect: "allow" },
  ],
});
describe("trusted session context", () => {
  it("enters the only platform workspace without company permissions", async () => {
    expect(await loadSessionContext(repo([], true), user, null)).toEqual({
      context: {
        user,
        workspaces: [{ kind: "platform" }],
        active: { kind: "platform" },
        permissions: [],
      },
      staleChoice: false,
    });
  });
  it("requires a choice for zero or many workspaces", async () => {
    expect((await loadSessionContext(repo(), user, null)).context.active).toBeNull();
    expect(
      (await loadSessionContext(repo([company("owner"), company("staff")]), user, null)).context
        .active,
    ).toBeNull();
  });
  it("revalidates the remembered role and applies overrides", async () => {
    const ws = company("branch_manager");
    const result = await loadSessionContext(repo([ws, company("staff")]), user, {
      kind: "company",
      companyId: ws.companyId,
      role: ws.role,
    });
    expect(result.context.active).toEqual(ws);
    expect(result.context.permissions).toContain("pos.access");
    expect(result.context.permissions).not.toContain("reports.view");
  });
  it("marks removed membership stale and re-enters the sole remaining workspace", async () => {
    const ws = company("owner");
    const result = await loadSessionContext(repo([company("staff")]), user, {
      kind: "company",
      companyId: ws.companyId,
      role: ws.role,
    });
    expect(result.staleChoice).toBe(true);
    expect(result.context.active).toEqual(company("staff"));
  });
  it("refuses foreign company, foreign role and unheld platform", async () => {
    const r = repo([company("staff")]);
    await expect(
      selectWorkspace(r, { kind: "company", companyId: company("staff").companyId, role: "owner" }),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      selectWorkspace(r, {
        kind: "company",
        companyId: "40000000-0000-4000-8000-000000000002",
        role: "staff",
      }),
    ).rejects.toThrow("FORBIDDEN");
    await expect(selectWorkspace(r, { kind: "platform" })).rejects.toThrow("FORBIDDEN");
  });
  it("returns only the held selection to store", async () => {
    const ws = company("owner");
    const input = { kind: "company" as const, companyId: ws.companyId, role: ws.role };
    await expect(selectWorkspace(repo([ws]), input)).resolves.toEqual(input);
    await expect(selectWorkspace(repo([], true), { kind: "platform" })).resolves.toEqual({
      kind: "platform",
    });
  });
});
