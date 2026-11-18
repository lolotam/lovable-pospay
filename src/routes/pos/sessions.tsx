import { pageAllowed } from "@/modules/permissions/ui/area-guard";
import { NoAccess } from "@/modules/permissions/ui/no-access";
import { RouteError, RouteNotFound } from "@/modules/permissions/ui/route-feedback";
import { createFileRoute } from "@tanstack/react-router";
import { serviceSessionRecordingAvailable } from "@/modules/services";
import { SessionsPage } from "@/modules/services/ui/sessions-page";
import { preloadOperatorCompanies } from "@/modules/staff";
import { t } from "@/i18n";
export const Route = createFileRoute("/pos/sessions")({
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
  head: () => ({
    meta: [
      { title: `${t("sessions.title")} — PosPay` },
      { name: "description", content: t("sessions.title") },
      { property: "og:title", content: t("sessions.title") },
      { property: "og:description", content: t("sessions.title") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) =>
    context.allowed &&
    pageAllowed(context.session, "/pos/sessions") &&
    serviceSessionRecordingAvailable
      ? preloadOperatorCompanies(context.queryClient)
      : undefined,
  component: GuardedPage,
});
function ExistingPage() {
  return serviceSessionRecordingAvailable ? (
    <SessionsPage />
  ) : (
    <p role="status">{t("sessions.unavailable")}</p>
  );
}
function GuardedPage() {
  const { session, allowed } = Route.useRouteContext();
  return allowed && pageAllowed(session, "/pos/sessions") ? (
    <ExistingPage />
  ) : (
    <NoAccess workspace={session.active} />
  );
}
