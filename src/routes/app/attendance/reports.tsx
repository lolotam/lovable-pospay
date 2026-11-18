import { pageAllowed } from "@/modules/permissions/ui/area-guard";
import { NoAccess } from "@/modules/permissions/ui/no-access";
import { RouteError, RouteNotFound } from "@/modules/permissions/ui/route-feedback";
import { createFileRoute } from "@tanstack/react-router";
import { ReportsPage } from "@/modules/attendance/ui/reports-page";
import { preloadOperatorCompanies } from "@/modules/staff";
import { t } from "@/i18n";
export const Route = createFileRoute("/app/attendance/reports")({
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
  head: () => ({
    meta: [
      { title: `${t("reports.title")} — PosPay` },
      { name: "description", content: t("reports.title") },
      { property: "og:title", content: t("reports.title") },
      { property: "og:description", content: t("reports.title") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) =>
    context.allowed && pageAllowed(context.session, "/app/attendance/reports")
      ? preloadOperatorCompanies(context.queryClient)
      : undefined,
  component: GuardedPage,
});

function GuardedPage() {
  const { session, allowed } = Route.useRouteContext();
  return allowed && pageAllowed(session, "/app/attendance/reports") ? (
    <ReportsPage />
  ) : (
    <NoAccess workspace={session.active} />
  );
}
