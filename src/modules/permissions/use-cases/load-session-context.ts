import type { SessionContextDto, SelectWorkspaceInput, WorkspaceDto } from "../contracts";
import type { SessionContextRepository } from "../ports/session-context-repository";
import { effectivePermissions } from "../domain/permission-matrix";
import { sameWorkspace } from "../domain/workspace";
export async function loadSessionContext(
  repo: SessionContextRepository,
  user: SessionContextDto["user"],
  remembered: SelectWorkspaceInput | null,
): Promise<{ context: SessionContextDto; staleChoice: boolean }> {
  const companies = await repo.listCompanyWorkspaces();
  const workspaces: WorkspaceDto[] = (await repo.isPlatformAdmin())
    ? [{ kind: "platform" }, ...companies]
    : companies;
  const found = remembered ? workspaces.find((ws) => sameWorkspace(ws, remembered)) : undefined;
  const staleChoice = remembered !== null && !found;
  const active = found ?? (workspaces.length === 1 ? (workspaces[0] ?? null) : null);
  const permissions =
    active?.kind === "company"
      ? effectivePermissions(active.role, await repo.listOverrides(active.companyId))
      : [];
  return { context: { user, workspaces, active, permissions }, staleChoice };
}
