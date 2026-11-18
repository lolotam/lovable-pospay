import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "@/modules/permissions/ui/dashboard";
import { t } from "@/i18n";
export const Route = createFileRoute("/pos/")({
  head: () => ({
    meta: [
      { title: `${t("nav.receptionHome")} — PosPay pos` },
      { name: "description", content: t("dashboard.welcome") },
      { property: "og:title", content: `PosPay pos` },
      { property: "og:description", content: t("dashboard.welcome") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Home,
});
function Home() {
  const { session } = Route.useRouteContext();
  return (
    <>
      <Dashboard area="pos" context={session} />
    </>
  );
}
