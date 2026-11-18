import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { t, type MessageKey } from "@/i18n";
import { isAuthNotConfigured } from "@/lib/auth-errors";
import { DIAGNOSIS_MAX_CHARS, type DiagnosisDto } from "../contracts";
import { diagnoseFn } from "../functions/diagnose.functions";

function errorKey(e: unknown): MessageKey {
  if (isAuthNotConfigured(e)) return "auth.notConfigured";
  const msg = e instanceof Error ? e.message : "";
  if (msg.includes("NO_DEFAULT_AI")) return "diag.noDefault";
  if (msg.includes("FORBIDDEN") || msg.includes("UNAUTHENTICATED")) return "diag.forbidden";
  return "diag.failed";
}

export function DiagnosePage() {
  const diagnose = useServerFn(diagnoseFn);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DiagnosisDto | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const tooLong = text.length > DIAGNOSIS_MAX_CHARS;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await diagnose({ data: { text } }));
    } catch (err) {
      setError(errorKey(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <h1 className="text-xl font-bold sm:text-2xl">{t("diag.title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("diag.subtitle")}</p>
      <form onSubmit={submit} className="mt-6 space-y-3">
        <label htmlFor="diag-input" className="block text-sm font-medium">
          {t("diag.input")}
        </label>
        <Textarea
          id="diag-input"
          dir="ltr"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("diag.placeholder")}
          className="min-h-48 font-mono text-xs sm:text-sm"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className={tooLong ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
            {tooLong ? t("diag.tooLong") : `${text.length} / ${DIAGNOSIS_MAX_CHARS}`}
          </span>
          <Button type="submit" disabled={busy || tooLong || text.trim().length < 3} className="min-h-11 w-full sm:w-auto">
            {busy ? t("diag.busy") : t("diag.submit")}
          </Button>
        </div>
      </form>
      {error && (
        <p role="alert" className="mt-6 rounded-md border border-border bg-warning-soft px-4 py-3 text-sm text-destructive">
          {t(error)}
        </p>
      )}
      {result && (
        <section className="mt-6 rounded-lg border border-border bg-card p-4 sm:p-6" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <h2 className="text-base font-bold text-foreground">{t("diag.result")}</h2>
            <span>
              {t("diag.model")}: <span dir="ltr">{result.provider} / {result.model}</span>
            </span>
          </div>
          <div className="mt-4 whitespace-pre-wrap break-words text-sm leading-7">{result.answer}</div>
        </section>
      )}
    </div>
  );
}
