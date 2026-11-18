import { createFileRoute } from "@tanstack/react-router";
import { CardsPage } from "@/modules/attendance/ui/cards-page";
import { cardQuery } from "@/modules/attendance/ui/cards-query";
import { preloadOperatorCompanies } from "@/modules/staff";
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
  loader: ({ context: { queryClient } }) =>
    preloadOperatorCompanies(queryClient, (companyId, userId) =>
      queryClient.ensureQueryData(cardQuery(companyId, userId)),
    ),
  component: CardsPage,
});
