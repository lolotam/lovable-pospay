import { createFileRoute } from "@tanstack/react-router";
import { CardScanPage } from "@/modules/attendance/ui/card-scan-page";
import { t } from "@/i18n";
export const Route = createFileRoute("/reception/cards")({
  head: () => ({
    meta: [
      { title: `${t("cards.scanTitle")} — PosPay` },
      { name: "description", content: t("cards.scanTitle") },
      { property: "og:title", content: t("cards.scanTitle") },
      { property: "og:description", content: t("cards.scanTitle") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CardScanPage,
});
