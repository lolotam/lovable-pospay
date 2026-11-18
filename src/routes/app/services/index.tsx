import { pageAllowed } from "@/modules/permissions/ui/area-guard";
import { NoAccess } from "@/modules/permissions/ui/no-access";
import { RouteError, RouteNotFound } from "@/modules/permissions/ui/route-feedback";
import { createFileRoute } from "@tanstack/react-router";
import { CatalogPage } from "@/modules/services/ui/catalog-page";
import { catalogQuery } from "@/modules/services/ui/catalog-query";
import { preloadOperatorCompanies } from "@/modules/staff";
import { t } from "@/i18n";
export const Route = createFileRoute("/app/services/")({
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
  head: () => ({
    meta: [
      { title: `${t("services.title")} — PosPay` },
      { name: "description", content: t("services.title") },
      { property: "og:title", content: t("services.title") },
      { property: "og:description", content: t("services.title") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) => {
    if (!context.allowed || !pageAllowed(context.session, "/app/services")) return;
    const { queryClient } = context;
    void preloadOperatorCompanies(queryClient, (companyId, userId) =>
      queryClient.ensureQueryData(catalogQuery(companyId, userId)),
    );
  },
  component: GuardedPage,
});

function GuardedPage() {
  const { session, allowed } = Route.useRouteContext();
  return allowed && pageAllowed(session, "/app/services") ? (
    <CatalogPage />
  ) : (
    <NoAccess workspace={session.active} />
  );
}
