import { queryOptions, useSuspenseQuery, type QueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { isAuthNotConfigured } from "@/lib/auth-errors";
import { getMyCompanies } from "@/lib/tenancy.functions";
import { companyRoleSchema, type SessionContextDto, type WorkspaceDto } from "../contracts";
import { effectivePermissions } from "../domain/permission-matrix";
import { sameWorkspace } from "../domain/workspace";

// Part A adapter only. Part B replaces this with the authenticated cookie-backed DTO.
const storageKey = (userId: string) => `pospay-workspace:${userId}`;

function rememberedWorkspace(userId: string, workspaces: WorkspaceDto[]) {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(userId)) ?? "null");
    const active = workspaces.find((ws) => sameWorkspace(ws, saved)) ?? null;
    if (!active) localStorage.removeItem(storageKey(userId));
    return active;
  } catch {
    return null;
  }
}

async function loadSessionContext(): Promise<SessionContextDto | null> {
  const session = await authClient.getSession({ query: { disableCookieCache: true } });
  if (session.error) {
    if (isAuthNotConfigured(session.error)) return null;
    throw new Error("SESSION_VERIFICATION_FAILED");
  }
  if (!session.data) return null;
  const { user } = session.data;
  const companies = await getMyCompanies({ data: { expectedUserId: user.id } });
  const workspaces: WorkspaceDto[] = companies.flatMap((company) => {
    const role = companyRoleSchema.safeParse(company.role);
    return role.success
      ? [
          {
            kind: "company" as const,
            companyId: company.id,
            companyName: company.name,
            businessType: "salon" as const,
            role: role.data,
            branchId: null,
            branchName: null,
          },
        ]
      : [];
  });
  // Existing endpoint verifies platform membership server-side; never infer it from email.
  try {
    const { getConnectorsFn } = await import("@/modules/platform/functions/connectors.functions");
    await getConnectorsFn();
    workspaces.unshift({ kind: "platform" });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "FORBIDDEN") throw error;
  }
  const active =
    rememberedWorkspace(user.id, workspaces) ??
    (workspaces.length === 1 ? workspaces[0] : null) ??
    null;
  return {
    user: { id: user.id, name: user.name, email: user.email },
    workspaces,
    active,
    permissions: active?.kind === "company" ? effectivePermissions(active.role, []) : [],
  };
}

export const sessionContextQuery = queryOptions({
  queryKey: ["session-context"],
  queryFn: loadSessionContext,
  staleTime: 0,
  retry: false,
});

export function useSessionContext() {
  return useSuspenseQuery(sessionContextQuery).data;
}

export async function chooseWorkspace(
  cache: QueryClient,
  context: SessionContextDto,
  ws: WorkspaceDto,
) {
  if (!context.workspaces.some((owned) => sameWorkspace(owned, ws))) throw new Error("FORBIDDEN");
  try {
    localStorage.setItem(storageKey(context.user.id), JSON.stringify(ws));
  } catch {
    /* Storage can be unavailable. */
  }
  await cache.cancelQueries();
  cache.clear();
}
