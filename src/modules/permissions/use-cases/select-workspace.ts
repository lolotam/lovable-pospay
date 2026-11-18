import type { SelectWorkspaceInput } from "../contracts";
import type { SessionContextRepository } from "../ports/session-context-repository";
import { sameWorkspace } from "../domain/workspace";
export async function selectWorkspace(
  repo: SessionContextRepository,
  input: SelectWorkspaceInput,
): Promise<SelectWorkspaceInput> {
  const held =
    input.kind === "platform"
      ? await repo.isPlatformAdmin()
      : (await repo.listCompanyWorkspaces()).some((ws) => sameWorkspace(ws, input));
  if (!held) throw new Error("FORBIDDEN");
  return input;
}
