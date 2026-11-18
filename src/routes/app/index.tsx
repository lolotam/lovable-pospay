import { companyOverviewQuery } from "@/modules/permissions/ui/overview-query";
import { CompanyOverview } from "@/modules/permissions/ui/overview";
import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "@/modules/permissions/ui/dashboard";
import { t } from "@/i18n";
export const Route = createFileRoute("/app/")({
  head: () => ({
    meta: [
      { title: `${t("nav.dashboard")} — PosPay app` },
      { name: "description", content: t("dashboard.welcome") },
      { property: "og:title", content: `PosPay app` },
      { property: "og:description", content: t("dashboard.welcome") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) =>
    context.allowed && context.session.active?.kind === "company"
      ? context.queryClient.ensureQueryData(companyOverviewQuery(context.session.active.companyId))
      : undefined,
  component: Home,
});
function Home() {
  const { session } = Route.useRouteContext();
  return (
    <>
      <Dashboard area="app" context={session} />
      <CompanyOverview context={session} />
    </>
  );
}
