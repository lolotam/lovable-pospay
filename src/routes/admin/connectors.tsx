import { createFileRoute } from "@tanstack/react-router";
import { t } from "@/i18n";
import { ConnectorsPage } from "@/modules/platform/ui/connectors-page";

export const Route = createFileRoute("/admin/connectors")({
  ssr: false,
  head: () => ({
    meta: [
      { title: `${t("conn.title")} — PosPay` },
      { name: "description", content: t("conn.subtitle") },
      { property: "og:title", content: t("conn.title") },
      { property: "og:description", content: t("conn.subtitle") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ConnectorsPage,
});
