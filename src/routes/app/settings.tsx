import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/modules/permissions/ui/settings-page";
import { t } from "@/i18n";
export const Route = createFileRoute("/app/settings")({
  head: () => ({
    meta: [
      { title: `${t("settings.title")} — PosPay app` },
      { name: "description", content: t("settings.subtitle") },
      { property: "og:title", content: `PosPay app ${t("settings.title")}` },
      { property: "og:description", content: t("settings.subtitle") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <SettingsPage policy />,
});
