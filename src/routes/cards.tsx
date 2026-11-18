import { createFileRoute } from "@tanstack/react-router";
import { CardsPage } from "@/modules/attendance/ui/cards-page";
import { t } from "@/i18n";
export const Route = createFileRoute("/cards")({
  head: () => ({
    meta: [
      { title: `${t("cards.title")} — PosPay` },
      { name: "description", content: t("cards.title") },
      { property: "og:title", content: t("cards.title") },
      { property: "og:description", content: t("cards.title") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CardsPage,
});
