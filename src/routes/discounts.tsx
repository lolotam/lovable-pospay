import { createFileRoute } from "@tanstack/react-router";
import { DiscountsPage } from "@/modules/services/ui/discounts-page";
import { preloadOperatorCompanies } from "@/modules/staff";
import { t } from "@/i18n";
export const Route = createFileRoute("/discounts")({
  head: () => ({
    meta: [
      { title: `${t("discounts.title")} — PosPay` },
      { name: "description", content: t("discounts.title") },
      { property: "og:title", content: t("discounts.title") },
      { property: "og:description", content: t("discounts.title") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) => {
    void preloadOperatorCompanies(context.queryClient);
  },
  component: DiscountsPage,
});
