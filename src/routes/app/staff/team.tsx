import { pageAllowed } from "@/modules/permissions/ui/area-guard";
import { NoAccess } from "@/modules/permissions/ui/no-access";
import { RouteError, RouteNotFound } from "@/modules/permissions/ui/route-feedback";
import { createFileRoute } from "@tanstack/react-router";
import { TeamPage } from "@/modules/invitations/ui/team-page";
import { preloadOperatorCompanies } from "@/modules/staff";
import { t } from "@/i18n";
export const Route = createFileRoute("/app/staff/team")({
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
  head: () => ({
    meta: [
      { title: `${t("team.title")} — PosPay` },
      { name: "description", content: t("team.title") },
      { property: "og:title", content: t("team.title") },
      { property: "og:description", content: t("team.title") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) => {
    if (!context.allowed || !pageAllowed(context.session, "/app/staff/team")) return;
    void preloadOperatorCompanies(context.queryClient);
  },
  component: GuardedPage,
});

function GuardedPage() {
  const { session, allowed } = Route.useRouteContext();
  return allowed && pageAllowed(session, "/app/staff/team") ? (
    <TeamPage />
  ) : (
    <NoAccess workspace={session.active} />
  );
}
