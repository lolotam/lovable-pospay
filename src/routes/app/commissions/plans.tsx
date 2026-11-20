import { pageAllowed } from "@/modules/permissions/ui/area-guard";
import { NoAccess } from "@/modules/permissions/ui/no-access";
import { RouteError, RouteNotFound } from "@/modules/permissions/ui/route-feedback";
import { createFileRoute } from "@tanstack/react-router";
import { PlansPage } from "@/modules/commissions/ui/plans-page";
import { preloadOperatorCompanies } from "@/modules/staff";
import { t } from "@/i18n";
export const Route = createFileRoute("/app/commissions/plans")({
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
  head: () => ({
    meta: [
      { title: `${t("commissions.plansTitle")} — PosPay` },
      { name: "description", content: t("commissions.plansTitle") },
      { property: "og:title", content: t("commissions.plansTitle") },
      { property: "og:description", content: t("commissions.plansTitle") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) => {
    if (!context.allowed || !pageAllowed(context.session, "/app/commissions/plans")) return;
    void preloadOperatorCompanies(context.queryClient);
  },
  component: GuardedPage,
});

function GuardedPage() {
  const { session, allowed } = Route.useRouteContext();
  return allowed && pageAllowed(session, "/app/commissions/plans") ? (
    <PlansPage />
  ) : (
    <NoAccess workspace={session.active} />
  );
}
