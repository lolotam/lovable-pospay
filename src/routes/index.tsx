import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users, Clock, Scissors, Coins, Star, Bell, ArrowUpLeft } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { sessionContextQuery } from "@/modules/permissions/ui/use-session-context";
import { landingPath } from "@/modules/permissions";
import { Button } from "@/components/ui/button";
import { t, type MessageKey } from "@/i18n";
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: t("meta.home.title") },
      {
        name: "description",
        content: t("meta.home.description"),
      },
      { property: "og:title", content: t("meta.home.title") },
      {
        property: "og:description",
        content: t("meta.home.description"),
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Landing,
});
const modules = [
  ["modules.staff", Users],
  ["modules.attendance", Clock],
  ["modules.services", Scissors],
  ["modules.commissions", Coins],
  ["modules.ratings", Star],
  ["modules.notifications", Bell],
] as const;
function Landing() {
  const session = authClient.useSession();
  const { data: context } = useQuery({ ...sessionContextQuery, enabled: !!session.data });
  const target = session.data
    ? landingPath(context?.workspaces ?? [], context?.active ?? null)
    : "/sign-in";
  return (
    <main className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center border-b border-border px-5 py-6 sm:px-8">
        <span className="text-xl font-bold">{t("app.name")}</span>
      </header>
      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
        <p className="text-sm font-medium text-muted-foreground">{t("app.tagline")}</p>
        <h1 className="mt-4 text-5xl font-bold sm:text-7xl">{t("app.name")}</h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          {t("app.description")}
        </p>
        <Button asChild className="mt-8 min-h-12 px-6">
          <Link to={target}>
            {t(session.data ? "landing.openDashboard" : "landing.cta")}
            <ArrowUpLeft className="size-4" />
          </Link>
        </Button>
      </section>
      <section className="border-t border-border bg-muted/40">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-5 py-10 sm:grid-cols-3 sm:px-8">
          {modules.map(([label, Icon]) => (
            <div key={label} className="flex items-center gap-3">
              <Icon aria-hidden className="size-5 shrink-0 text-accent" />
              <span className="text-sm font-medium">{t(label as MessageKey)}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
