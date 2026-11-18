import { createFileRoute } from "@tanstack/react-router";
import { TeamPage } from "@/modules/invitations/ui/team-page";
import { preloadOperatorCompanies } from "@/modules/staff";
import { t } from "@/i18n";
export const Route = createFileRoute("/team")({
  head: () => ({
    meta: [
      { title: `${t("team.title")} — PosPay` },
      { name: "description", content: t("team.title") },
      { property: "og:title", content: t("team.title") },
      { property: "og:description", content: t("team.title") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) => {
    void preloadOperatorCompanies(context.queryClient);
  },
  component: TeamPage,
});
