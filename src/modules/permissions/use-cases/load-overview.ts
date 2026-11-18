import type { OverviewReader } from "../ports/overview-reader";
import type { SessionContextRepository } from "../ports/session-context-repository";
import type { SessionContextDto, SelectWorkspaceInput } from "../contracts";
import { loadSessionContext } from "./load-session-context";
import { companyOverviewScope } from "./load-company-overview";
export function loadPlatformOverview(reader: Pick<OverviewReader, "platform">) {
  return reader.platform();
}
export async function loadCompanyOverview(
  repo: SessionContextRepository,
  reader: OverviewReader,
  user: SessionContextDto["user"],
  remembered: SelectWorkspaceInput | null,
  companyId: string,
) {
  const { context } = await loadSessionContext(repo, user, remembered);
  const active = context.active;
  if (active?.kind !== "company" || active.companyId !== companyId) throw new Error("FORBIDDEN");
  return reader.company(companyId, await companyOverviewScope(repo, companyId, active));
}
export async function loadOwnOverview(
  repo: SessionContextRepository,
  reader: OverviewReader,
  user: SessionContextDto["user"],
  remembered: SelectWorkspaceInput | null,
  companyId: string,
) {
  const { context } = await loadSessionContext(repo, user, remembered);
  const active = context.active;
  if (active?.kind !== "company" || active.companyId !== companyId || active.role !== "staff")
    throw new Error("FORBIDDEN");
  return reader.own(companyId);
}
