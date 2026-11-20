import { pageAllowed } from "@/modules/permissions/ui/area-guard";
import { NoAccess } from "@/modules/permissions/ui/no-access";
import { RouteError, RouteNotFound } from "@/modules/permissions/ui/route-feedback";
import { createFileRoute } from "@tanstack/react-router";
import { ApprovalsPage } from "@/modules/services/ui/approvals-page";
import { preloadOperatorCompanies } from "@/modules/staff";
import { t } from "@/i18n";
export const Route = createFileRoute("/app/services/approvals")({
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
  head: () => ({
    meta: [
      { title: `${t("approvals.title")} — PosPay` },
      { name: "description", content: t("approvals.title") },
      { property: "og:title", content: t("approvals.title") },
      { property: "og:description", content: t("approvals.title") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) => {
    if (!context.allowed || !pageAllowed(context.session, "/app/services/approvals")) return;
    void preloadOperatorCompanies(context.queryClient);
  },
  component: GuardedPage,
});

function GuardedPage() {
  const { session, allowed } = Route.useRouteContext();
  return allowed && pageAllowed(session, "/app/services/approvals") ? (
    <ApprovalsPage />
  ) : (
    <NoAccess workspace={session.active} />
  );
}
