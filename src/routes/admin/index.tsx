import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "@/modules/permissions/ui/dashboard";
import { t } from "@/i18n";
import { SystemStatus, statusQuery } from "@/modules/permissions/ui/system-status";
import { RouteError, RouteNotFound } from "@/modules/permissions/ui/route-feedback";
export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: `${t("nav.dashboard")} — PosPay admin` },
      { name: "description", content: t("dashboard.welcome") },
      { property: "og:title", content: `PosPay admin` },
      { property: "og:description", content: t("dashboard.welcome") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) =>
    context.allowed ? context.queryClient.ensureQueryData(statusQuery) : undefined,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
  component: Home,
});
function Home() {
  const { session } = Route.useRouteContext();
  return (
    <>
      <Dashboard area="admin" context={session} />
      <SystemStatus />
    </>
  );
}
