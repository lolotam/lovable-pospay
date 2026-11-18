import { createFileRoute } from "@tanstack/react-router";
import { CatalogPage } from "@/modules/services/ui/catalog-page";
import { t } from "@/i18n";
export const Route = createFileRoute("/services")({
  head: () => ({
    meta: [
      { title: `${t("services.title")} — PosPay` },
      { name: "description", content: t("services.title") },
      { property: "og:title", content: t("services.title") },
      { property: "og:description", content: t("services.title") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CatalogPage,
});
