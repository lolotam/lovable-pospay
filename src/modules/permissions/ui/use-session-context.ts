import { queryOptions, useSuspenseQuery, type QueryClient } from "@tanstack/react-query";
import { getSessionContext, selectWorkspace } from "../functions/session-context.functions";
import type { SessionContextDto, WorkspaceDto } from "../contracts";
export const sessionContextQuery = queryOptions({
  queryKey: ["session-context"],
  queryFn: () => getSessionContext(),
  staleTime: 0,
  retry: false,
});
export function useSessionContext() {
  return useSuspenseQuery(sessionContextQuery).data;
}
export async function chooseWorkspace(
  cache: QueryClient,
  _context: SessionContextDto,
  ws: WorkspaceDto,
) {
  await selectWorkspace({
    data:
      ws.kind === "platform"
        ? { kind: "platform" }
        : { kind: "company", companyId: ws.companyId, role: ws.role },
  });
  await cache.cancelQueries();
  cache.clear();
}
