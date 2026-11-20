import { pageAllowed } from "@/modules/permissions/ui/area-guard";
import { NoAccess } from "@/modules/permissions/ui/no-access";
import { RouteError, RouteNotFound } from "@/modules/permissions/ui/route-feedback";
import { createFileRoute } from "@tanstack/react-router";
import { ManageSessionsPage } from "@/modules/services/ui/manage-sessions-page";
import { preloadOperatorCompanies } from "@/modules/staff";
import { t } from "@/i18n";
export const Route = createFileRoute("/app/services/sessions")({
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
  head: () => ({
    meta: [
      { title: `${t("sessions.manageTitle")} — PosPay` },
      { name: "description", content: t("sessions.manageTitle") },
      { property: "og:title", content: t("sessions.manageTitle") },
      { property: "og:description", content: t("sessions.manageTitle") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) => {
    if (!context.allowed || !pageAllowed(context.session, "/app/services/sessions")) return;
    void preloadOperatorCompanies(context.queryClient);
  },
  component: GuardedPage,
});

function GuardedPage() {
  const { session, allowed } = Route.useRouteContext();
  const isOwner = session.active?.kind === "company" && session.active.role === "owner";
  return allowed && pageAllowed(session, "/app/services/sessions") ? (
    <ManageSessionsPage isOwner={isOwner} />
  ) : (
    <NoAccess workspace={session.active} />
  );
}
