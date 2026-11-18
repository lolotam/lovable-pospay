import { overviewBranchScope } from "../domain/overview-scope";
import type { SessionContextRepository } from "../ports/session-context-repository";
import type { SelectWorkspaceInput } from "../contracts";
export async function companyOverviewScope(
  repo: SessionContextRepository,
  companyId: string,
  remembered: SelectWorkspaceInput | null,
) {
  const memberships = await repo.listCompanyWorkspaces();
  const role =
    remembered?.kind === "company" && remembered.companyId === companyId ? remembered.role : null;
  const workspace = memberships.find((ws) => ws.companyId === companyId && ws.role === role);
  if (!workspace) throw new Error("FORBIDDEN");
  return overviewBranchScope(workspace);
}
