import { createFileRoute } from "@tanstack/react-router";
import { AcceptInvitePage } from "@/modules/invitations/ui/accept-invite-page";
import { t } from "@/i18n";
export const Route = createFileRoute("/invite")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): { t: string } => ({
    t: typeof s["t"] === "string" ? s["t"] : "",
  }),
  head: () => ({
    meta: [
      { title: `${t("invite.title")} — PosPay` },
      { name: "description", content: t("invite.title") },
      { property: "og:title", content: t("invite.title") },
      { property: "og:description", content: t("invite.title") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: InviteRoute,
});
function InviteRoute() {
  const { t: token } = Route.useSearch();
  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-2xl font-semibold">{t("invite.title")}</h1>
      <AcceptInvitePage token={token} />
    </main>
  );
}
