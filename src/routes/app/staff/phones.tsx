import { createFileRoute } from "@tanstack/react-router";
import { PhoneManagement } from "@/modules/staff/ui/phone-management";
import { pageAllowed } from "@/modules/permissions/ui/area-guard";
import { NoAccess } from "@/modules/permissions/ui/no-access";
import { t } from "@/i18n";
export const Route = createFileRoute("/app/staff/phones")({
  head: () => ({
    meta: [
      { title: `${t("phone.title")} — PosPay PhoneManagement` },
      { name: "description", content: t("phone.title") },
      { property: "og:title", content: `PosPay PhoneManagement` },
      { property: "og:description", content: t("phone.title") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Phone,
});
function Phone() {
  const { session } = Route.useRouteContext();
  return pageAllowed(session, "/app/staff/phones") ? (
    <PhoneManagement />
  ) : (
    <NoAccess workspace={session.active} />
  );
}
