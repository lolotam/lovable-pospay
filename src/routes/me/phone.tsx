import { createFileRoute } from "@tanstack/react-router";
import { PhoneBinding } from "@/modules/staff/ui/phone-binding";
import { pageAllowed } from "@/modules/permissions/ui/area-guard";
import { NoAccess } from "@/modules/permissions/ui/no-access";
import { t } from "@/i18n";
export const Route = createFileRoute("/me/phone")({
  head: () => ({
    meta: [
      { title: `${t("phone.title")} — PosPay PhoneBinding` },
      { name: "description", content: t("phone.title") },
      { property: "og:title", content: `PosPay PhoneBinding` },
      { property: "og:description", content: t("phone.title") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Phone,
});
function Phone() {
  const { session } = Route.useRouteContext();
  return pageAllowed(session, "/me/phone") ? (
    <PhoneBinding />
  ) : (
    <NoAccess workspace={session.active} />
  );
}
