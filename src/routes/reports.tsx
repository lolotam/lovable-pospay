import { createFileRoute } from "@tanstack/react-router";
import { ReportsPage } from "@/modules/attendance/ui/reports-page";
import { operatorCompaniesQuery } from "@/modules/staff";
import { t } from "@/i18n";
export const Route = createFileRoute("/reports")({
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
  loader: ({ context }) => context.queryClient.ensureQueryData(operatorCompaniesQuery),
  component: ReportsPage,
});
