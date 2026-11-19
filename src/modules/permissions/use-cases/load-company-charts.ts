import type { SessionContextRepository } from "../ports/session-context-repository";
import type { ChartReader } from "../ports/chart-reader";
import type { ChartRange, SessionContextDto, SelectWorkspaceInput } from "../contracts";
import { loadSessionContext } from "./load-session-context";
import { companyOverviewScope } from "./load-company-overview";
export async function loadCompanyCharts(
  repo: SessionContextRepository,
  reader: ChartReader,
  user: SessionContextDto["user"],
  remembered: SelectWorkspaceInput | null,
  companyId: string,
  range: ChartRange,
  recording: boolean,
) {
  const { context } = await loadSessionContext(repo, user, remembered);
  if (
    context.active?.kind !== "company" ||
    context.active.companyId !== companyId ||
    !context.permissions.includes("reports.view")
  )
    throw new Error("FORBIDDEN");
  const branch = await companyOverviewScope(repo, companyId, context.active);
  return reader.company(companyId, branch, range, recording);
}
export async function loadMyStrip(
  repo: SessionContextRepository,
  reader: ChartReader,
  user: SessionContextDto["user"],
  remembered: SelectWorkspaceInput | null,
) {
  const { context } = await loadSessionContext(repo, user, remembered);
  if (context.active?.kind !== "company") throw new Error("FORBIDDEN");
  return reader.own(context.active.companyId);
}
export async function loadGrowth(repo: SessionContextRepository, reader: ChartReader) {
  if (!(await repo.isPlatformAdmin())) throw new Error("FORBIDDEN");
  return reader.platform();
}
