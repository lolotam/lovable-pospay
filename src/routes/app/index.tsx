import { companyOverviewQuery } from "@/modules/permissions/ui/overview-query";
import { CompanyOverview } from "@/modules/permissions/ui/overview";
import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "@/modules/permissions/ui/dashboard";
import { t } from "@/i18n";
import { parseRange } from "@/modules/permissions";
import { CompanyCharts } from "@/modules/permissions/ui/charts/company-charts";
import { companyChartsQuery } from "@/modules/permissions/ui/charts/chart-query";
export const Route = createFileRoute("/app/")({
  validateSearch: (search: Record<string, unknown>): { range?: number } => ({
    range: parseRange(search["range"]),
  }),
  loaderDeps: ({ search }) => ({ range: parseRange(search.range) }),
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
  loader: ({ context, deps }) =>
    context.allowed && context.session.active?.kind === "company"
      ? Promise.all([
          context.queryClient.ensureQueryData(
            companyOverviewQuery(context.session.active.companyId),
          ),
          context.session.permissions.includes("reports.view")
            ? context.queryClient.ensureQueryData(
                companyChartsQuery(context.session.active.companyId, deps.range),
              )
            : undefined,
        ])
      : undefined,
  component: Home,
});
function Home() {
  const { session } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <>
      <Dashboard area="app" context={session}>
        <CompanyOverview context={session} />
        <CompanyCharts
          context={session}
          range={parseRange(search.range)}
          onRange={(range) => void navigate({ search: { range } })}
        />
      </Dashboard>
    </>
  );
}
