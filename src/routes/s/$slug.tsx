import { createFileRoute, notFound } from "@tanstack/react-router";
import { RouteNotFound } from "@/modules/permissions/ui/route-feedback";
import { t } from "@/i18n";
export const Route = createFileRoute("/s/$slug")({
  beforeLoad: () => {
    throw notFound();
  },
  notFoundComponent: RouteNotFound,
  head: () => ({
    meta: [
      { title: `${t("page.notFound")} — PosPay` },
      { name: "description", content: t("page.notFoundBody") },
      { property: "og:title", content: t("page.notFound") },
      { property: "og:description", content: t("page.notFoundBody") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});
