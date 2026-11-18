import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/modules/permissions/ui/settings-page";
import { t } from "@/i18n";
export const Route = createFileRoute("/pos/settings")({
  head: () => ({
    meta: [
      { title: `${t("settings.title")} — PosPay pos` },
      { name: "description", content: t("settings.subtitle") },
      { property: "og:title", content: `PosPay pos ${t("settings.title")}` },
      { property: "og:description", content: t("settings.subtitle") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <SettingsPage />,
});
