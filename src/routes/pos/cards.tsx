import { pageAllowed } from "@/modules/permissions/ui/area-guard";
import { NoAccess } from "@/modules/permissions/ui/no-access";
import { RouteError, RouteNotFound } from "@/modules/permissions/ui/route-feedback";
import { createFileRoute } from "@tanstack/react-router";
import { CardScanPage } from "@/modules/attendance/ui/card-scan-page";
import { preloadOperatorCompanies } from "@/modules/staff";
import { t } from "@/i18n";
export const Route = createFileRoute("/pos/cards")({
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
  head: () => ({
    meta: [
      { title: `${t("cards.scanTitle")} — PosPay` },
      { name: "description", content: t("cards.scanTitle") },
      { property: "og:title", content: t("cards.scanTitle") },
      { property: "og:description", content: t("cards.scanTitle") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) =>
    context.allowed && pageAllowed(context.session, "/pos/cards")
      ? preloadOperatorCompanies(context.queryClient)
      : undefined,
  component: GuardedPage,
});

function GuardedPage() {
  const { session, allowed } = Route.useRouteContext();
  return allowed && pageAllowed(session, "/pos/cards") ? (
    <CardScanPage />
  ) : (
    <NoAccess workspace={session.active} />
  );
}
