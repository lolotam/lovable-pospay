import { pageAllowed } from "@/modules/permissions/ui/area-guard";
import { NoAccess } from "@/modules/permissions/ui/no-access";
import { RouteError, RouteNotFound } from "@/modules/permissions/ui/route-feedback";
import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { CorrectionsPage } from "@/modules/attendance/ui/corrections-page";
import { t } from "@/i18n";

export const Route = createFileRoute("/app/attendance/corrections")({
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
  head: () => ({
    meta: [
      { title: "تصحيح الانصراف المنسي — PosPay" },
      { name: "description", content: "مراجعة المدير للانصراف المنسي مع حفظ الأصل وسبب التصحيح." },
      { property: "og:title", content: "تصحيح الانصراف المنسي — PosPay" },
      {
        property: "og:description",
        content: "مراجعة المدير للانصراف المنسي مع حفظ الأصل وسبب التصحيح.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: GuardedPage,
});
function ExistingPage() {
  return (
    <ClientOnly fallback={<p role="status">{t("phone.loading")}</p>}>
      <CorrectionsPage />
    </ClientOnly>
  );
}
function GuardedPage() {
  const { session, allowed } = Route.useRouteContext();
  return allowed && pageAllowed(session, "/app/attendance/corrections") ? (
    <ExistingPage />
  ) : (
    <NoAccess workspace={session.active} />
  );
}
