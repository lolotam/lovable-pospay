import { pageAllowed } from "@/modules/permissions/ui/area-guard";
import { NoAccess } from "@/modules/permissions/ui/no-access";
import { RouteError, RouteNotFound } from "@/modules/permissions/ui/route-feedback";
import { createFileRoute } from "@tanstack/react-router";
import { SalariesPage } from "@/modules/commissions/ui/salaries-page";
import { preloadOperatorCompanies } from "@/modules/staff";
import { t } from "@/i18n";
export const Route = createFileRoute("/app/commissions/salaries")({
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
  head: () => ({
    meta: [
      { title: `${t("salaries.title")} — PosPay` },
      { name: "description", content: t("salaries.title") },
      { property: "og:title", content: t("salaries.title") },
      { property: "og:description", content: t("salaries.title") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) => {
    if (!context.allowed || !pageAllowed(context.session, "/app/commissions/salaries")) return;
    void preloadOperatorCompanies(context.queryClient);
  },
  component: GuardedPage,
});

function GuardedPage() {
  const { session, allowed } = Route.useRouteContext();
  return allowed && pageAllowed(session, "/app/commissions/salaries") ? (
    <SalariesPage />
  ) : (
    <NoAccess workspace={session.active} />
  );
}
