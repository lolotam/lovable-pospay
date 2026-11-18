import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>) => ({
    token:
      typeof search["token"] === "string" && search["token"].length <= 256
        ? search["token"]
        : undefined,
    error: typeof search["error"] === "string" ? search["error"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "استعادة كلمة المرور — PosPay" },
      { name: "description", content: "تعيين كلمة مرور جديدة بأمان لحساب PosPay." },
      { property: "og:title", content: "استعادة كلمة المرور — PosPay" },
      { property: "og:description", content: "تعيين كلمة مرور جديدة بأمان لحساب PosPay." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [token, setToken] = useState(search.token);
  const [linkError] = useState(search.error);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const valid = Boolean(token) && !linkError && !invalid;

  useEffect(() => {
    if (search.token || search.error) {
      void navigate({ search: { token: undefined, error: undefined }, replace: true });
    }
  }, [navigate, search.token, search.error]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!token || !valid || busy) return;
    if (password !== confirm) {
      setMessage(t("auth.passwordMismatch"));
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await authClient.resetPassword({ token, newPassword: password });
      if (result.error) {
        setInvalid(result.error.code === "INVALID_TOKEN");
        setMessage(t(result.error.status === 429 ? "auth.rateLimited" : "auth.resetFailed"));
      } else {
        setDone(true);
        setPassword("");
        setConfirm("");
        setToken(undefined);
      }
    } catch {
      setMessage(t("auth.resetFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-10 sm:px-6 sm:py-20">
      <h1 className="text-2xl font-bold">{t("auth.resetTitle")}</h1>
      {done ? (
        <p role="status" className="mt-6 text-sm">
          {t("auth.resetSuccess")}
        </p>
      ) : !valid ? (
        <p role="alert" className="mt-6 text-sm text-destructive">
          {t("auth.invalidReset")}
        </p>
      ) : (
        <form onSubmit={submit} className="mt-8 space-y-4">
          <div className="space-y-2">
            <label htmlFor="new-password" className="text-sm font-medium">
              {t("auth.newPassword")}
            </label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
              value={password}
              disabled={busy}
              className="h-11"
              dir="ltr"
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="confirm-password" className="text-sm font-medium">
              {t("auth.confirmPassword")}
            </label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
              value={confirm}
              disabled={busy}
              className="h-11"
              dir="ltr"
              aria-invalid={message === t("auth.passwordMismatch")}
              aria-describedby={message ? "reset-error" : undefined}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <Button type="submit" className="h-11 w-full" disabled={busy}>
            {t(busy ? "auth.busy" : "auth.savePassword")}
          </Button>
          {message && (
            <p id="reset-error" role="alert" className="text-sm">
              {message}
            </p>
          )}
        </form>
      )}
      <Button asChild variant="link" className="mt-3 min-h-11 w-full">
        <Link to="/sign-in">{t("auth.backToSignIn")}</Link>
      </Button>
    </main>
  );
}
