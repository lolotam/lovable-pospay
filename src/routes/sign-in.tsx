import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { t } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/sign-in")({
  head: () => ({
    meta: [
      { title: "تسجيل الدخول — PosPay" },
      { name: "description", content: "دخول الإدارة والموظفات إلى PosPay." },
      { property: "og:title", content: "تسجيل الدخول — PosPay" },
      { property: "og:description", content: "دخول الإدارة والموظفات إلى PosPay." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SignIn,
});

function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setMessage(null);
    setBusy(true);
    try {
      if (recovering) {
        const { error } = await authClient.requestPasswordReset({
          email,
          redirectTo: `${window.location.origin}/reset-password`,
        });
        const key =
          error?.status === 429
            ? "auth.rateLimited"
            : error?.status === 503 || error?.code === "RESET_PASSWORD_DISABLED"
              ? "auth.resetUnavailable"
              : error
                ? "auth.resetFailed"
                : "auth.resetSent";
        setMessage(t(key));
      } else {
        const { error } = await authClient.signIn.email({ email, password });
        setMessage(
          t(error?.status === 503 ? "auth.notConfigured" : error ? "auth.failed" : "auth.success"),
        );
      }
    } catch {
      setMessage(t(recovering ? "auth.resetFailed" : "auth.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-10 sm:px-6 sm:py-20">
      <h1 className="text-2xl font-bold">
        {t(recovering ? "auth.recoveryTitle" : "auth.adminTitle")}
      </h1>
      {!recovering && <p className="mt-2 text-sm text-muted-foreground">{t("auth.staffNote")}</p>}
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium">
            {t("auth.email")}
          </label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            disabled={busy}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11"
            dir="ltr"
          />
        </div>
        {!recovering && (
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">
              {t("auth.password")}
            </label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              disabled={busy}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11"
              dir="ltr"
            />
          </div>
        )}
        <Button type="submit" className="h-11 w-full" disabled={busy}>
          {t(busy ? "auth.busy" : recovering ? "auth.sendReset" : "auth.submit")}
        </Button>
        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}
      </form>
      <Button
        type="button"
        variant="link"
        className="mt-3 min-h-11 w-full"
        disabled={busy}
        onClick={() => {
          setRecovering(!recovering);
          setPassword("");
          setMessage(null);
        }}
      >
        {t(recovering ? "auth.backToSignIn" : "auth.forgot")}
      </Button>
    </main>
  );
}
