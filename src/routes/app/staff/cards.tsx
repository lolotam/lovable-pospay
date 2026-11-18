import { pageAllowed } from "@/modules/permissions/ui/area-guard";
import { NoAccess } from "@/modules/permissions/ui/no-access";
import { RouteError, RouteNotFound } from "@/modules/permissions/ui/route-feedback";
import { createFileRoute } from "@tanstack/react-router";
import { CardsPage } from "@/modules/attendance/ui/cards-page";
import { cardQuery } from "@/modules/attendance/ui/cards-query";
import { preloadOperatorCompanies } from "@/modules/staff";
import { t } from "@/i18n";
export const Route = createFileRoute("/app/staff/cards")({
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
  head: () => ({
    meta: [
      { title: `${t("cards.title")} — PosPay` },
      { name: "description", content: t("cards.title") },
      { property: "og:title", content: t("cards.title") },
      { property: "og:description", content: t("cards.title") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) => {
    if (!context.allowed || !pageAllowed(context.session, "/app/staff/cards")) return;
    const { queryClient } = context;
    void preloadOperatorCompanies(queryClient, (companyId, userId) =>
      queryClient.ensureQueryData(cardQuery(companyId, userId)),
    );
  },
  component: GuardedPage,
});

function GuardedPage() {
  const { session, allowed } = Route.useRouteContext();
  return allowed && pageAllowed(session, "/app/staff/cards") ? (
    <CardsPage />
  ) : (
    <NoAccess workspace={session.active} />
  );
}
