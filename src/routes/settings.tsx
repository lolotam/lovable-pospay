import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useEffect, useState } from "react";
import { CompanyScope, preloadOperatorCompanies } from "@/modules/staff";
import { CardActions } from "@/modules/attendance/ui/cards-page";
import { cardQuery } from "@/modules/attendance/ui/cards-query";
import { t } from "@/i18n";
import { applyTheme, readTheme, type Theme } from "@/lib/theme/theme";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: `${t("settings.title")} — PosPay` },
      { name: "description", content: t("settings.subtitle") },
      { property: "og:title", content: t("settings.title") },
      { property: "og:description", content: t("settings.subtitle") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context: { queryClient } }) =>
    preloadOperatorCompanies(queryClient, (companyId, userId) =>
      queryClient.ensureQueryData(cardQuery(companyId, userId)),
    ),
  component: SettingsPage,
});

const OPTIONS: Theme[] = ["light", "dark"];

function SettingsPage() {
  const [theme, setTheme] = useState<Theme | null>(null);
  useEffect(() => setTheme(readTheme()), []);

  function choose(next: Theme) {
    applyTheme(next);
    setTheme(next);
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-8 sm:px-6 sm:py-16">
      <h1 className="text-2xl font-bold">{t("settings.title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("settings.subtitle")}</p>
      <fieldset className="mt-8">
        <legend className="mb-3 text-sm font-medium">{t("settings.theme")}</legend>
        <div role="radiogroup" className="grid grid-cols-2 gap-3">
          {OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              role="radio"
              aria-checked={theme === opt}
              onClick={() => choose(opt)}
              className="flex min-h-24 flex-col items-start justify-between rounded-lg border border-border bg-card p-4 text-start text-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring aria-checked:border-foreground aria-checked:ring-1 aria-checked:ring-foreground"
            >
              <span
                aria-hidden
                className={
                  opt === "dark"
                    ? "size-6 rounded-full border border-border bg-[oklch(0.19_0.006_60)]"
                    : "size-6 rounded-full border border-border bg-[oklch(0.97_0_0)]"
                }
              />
              <span className="font-medium">
                {t(opt === "dark" ? "settings.dark" : "settings.light")}
              </span>
            </button>
          ))}
        </div>
      </fieldset>
      <Suspense fallback={<p role="status">{t("phone.loading")}</p>}>
        <CompanyScope title="cards.policy">
          {(id, userId) => <CardActions companyId={id} userId={userId} policyOnly />}
        </CompanyScope>
      </Suspense>
    </main>
  );
}
