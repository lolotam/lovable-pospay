import { createFileRoute, redirect } from "@tanstack/react-router";
import { sessionContextQuery } from "@/modules/permissions/ui/use-session-context";
import { WorkspacesPage } from "@/modules/permissions/ui/workspaces-page";
import { RouteError, RouteNotFound } from "@/modules/permissions/ui/route-feedback";
import { landingPath, safeRedirectPath } from "@/modules/permissions";
import { pageAllowed } from "@/modules/permissions/ui/area-guard";
import { t } from "@/i18n";
export const Route = createFileRoute("/workspaces")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { redirect?: string } =>
    typeof search["redirect"] === "string" ? { redirect: search["redirect"] } : {},
  beforeLoad: async ({ context, search }) => {
    const session = await context.queryClient.fetchQuery(sessionContextQuery);
    if (!session) throw redirect({ to: "/sign-in", search: { redirect: "/workspaces" } });
    const requested = safeRedirectPath(search.redirect);
    if (requested && pageAllowed(session, requested.split("?")[0] ?? ""))
      throw redirect({ href: requested });
    const target = landingPath(session.workspaces, session.active);
    if (target !== "/workspaces") throw redirect({ to: target });
    return { session };
  },
  head: () => ({
    meta: [
      { title: `${t("ws.title")} — PosPay` },
      { name: "description", content: t("ws.title") },
      { property: "og:title", content: t("ws.title") },
      { property: "og:description", content: t("ws.title") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
  component: Workspaces,
});
function Workspaces() {
  const { session } = Route.useRouteContext();
  return <WorkspacesPage context={session} />;
}
