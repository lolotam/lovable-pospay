import { Button } from "@/components/ui/button";
import { Suspense, useEffect, useState } from "react";
import { CompanyScope } from "@/modules/staff";
import { CardActions } from "@/modules/attendance/ui/cards-page";
import { t } from "@/i18n";
import { applyTheme, readTheme, type Theme } from "@/lib/theme/theme";

const OPTIONS: Theme[] = ["light", "dark"];

export function SettingsPage({ policy = false }: { policy?: boolean }) {
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
            <Button
              key={opt}
              type="button"
              role="radio"
              aria-checked={theme === opt}
              onClick={() => choose(opt)}
              variant="outline"
              className="h-auto flex min-h-24 flex-col items-start justify-between rounded-lg border border-border bg-card p-4 text-start text-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring aria-checked:border-foreground aria-checked:ring-1 aria-checked:ring-foreground"
            >
              <span
                aria-hidden
                className={
                  opt === "dark"
                    ? "size-6 rounded-full border border-border bg-primary"
                    : "size-6 rounded-full border border-border bg-background"
                }
              />
              <span className="font-medium">
                {t(opt === "dark" ? "settings.dark" : "settings.light")}
              </span>
            </Button>
          ))}
        </div>
      </fieldset>
      {policy && (
        <Suspense fallback={<p role="status">{t("phone.loading")}</p>}>
          <CompanyScope title="cards.policy">
            {(id, userId) => <CardActions companyId={id} userId={userId} policyOnly />}
          </CompanyScope>
        </Suspense>
      )}
    </main>
  );
}
