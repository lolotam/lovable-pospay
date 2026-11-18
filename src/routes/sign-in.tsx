import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { sessionContextQuery } from "@/modules/permissions/ui/use-session-context";
import { landingPath, safeRedirectPath } from "@/modules/permissions";
import { pageAllowed } from "@/modules/permissions/ui/area-guard";
import { useEffect, useState } from "react";
import { duringAccountChange } from "@/lib/account-change";
import { authClient, verifyAuthSession } from "@/lib/auth-client";
import { isAuthNotConfigured } from "@/lib/auth-errors";
import { getSignInOptions } from "@/lib/auth-options.functions";
import { t } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Step = "login" | "request" | "code" | "choice" | "password" | "totp";

export const Route = createFileRoute("/sign-in")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { twoFactor?: boolean; redirect?: string } => ({
    ...(search["twoFactor"] === "true" || search["twoFactor"] === true ? { twoFactor: true } : {}),
    ...(typeof search["redirect"] === "string" ? { redirect: search["redirect"] } : {}),
  }),
  head: () => ({
    meta: [
      { title: "تسجيل الدخول — PosPay" },
      { name: "description", content: "دخول آمن إلى PosPay واستعادة الحساب برمز البريد." },
      { property: "og:title", content: "تسجيل الدخول — PosPay" },
      { property: "og:description", content: "دخول آمن إلى PosPay واستعادة الحساب برمز البريد." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SignIn,
});

function useSignInFlow() {
  const navigate = useNavigate();
  const cache = useQueryClient();
  const search = Route.useSearch();
  const [step, setStep] = useState<Step>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [otp, setOtp] = useState("");
  const [totp, setTotp] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [google, setGoogle] = useState(false);
  useEffect(() => {
    if (search.twoFactor) setStep("totp");
    getSignInOptions()
      .then((options) => setGoogle(options.google))
      .catch(() => setGoogle(false));
  }, [search.twoFactor]);

  async function finish(data: unknown) {
    setOtp("");
    setPassword("");
    setConfirm("");
    if (data && typeof data === "object" && "twoFactorRedirect" in data && data.twoFactorRedirect) {
      setStep("totp");
      return;
    }
    const context = await cache.fetchQuery(sessionContextQuery);
    const requested = safeRedirectPath(search.redirect);
    const destination =
      context && requested && pageAllowed(context, requested.split("?")[0] ?? "")
        ? requested
        : landingPath(context?.workspaces ?? [], context?.active ?? null);
    await navigate({ to: destination });
  }

  async function requestCode() {
    const result = await authClient.emailOtp.sendVerificationOtp({
      email,
      type: "forget-password",
    });
    if (result.error) throw result.error;
    setOtp("");
    setStep("code");
    setMessage(t("auth.otpSent"));
  }
  async function verifyCode() {
    const result = await authClient.emailOtp.checkVerificationOtp({
      email,
      otp,
      type: "forget-password",
    });
    if (result.error) throw result.error;
    setStep("choice");
  }
  async function resetPassword() {
    if (password !== confirm) {
      setMessage(t("auth.passwordMismatch"));
      return;
    }
    const result = await authClient.emailOtp.resetPassword({ email, otp, password });
    if (result.error) throw result.error;
    setPassword("");
    setConfirm("");
    setOtp("");
    setStep("login");
    setMessage(t("auth.resetSuccess"));
  }
  async function login(action?: "continue" | "google") {
    if (action === "google") {
      const result = await duringAccountChange(
        () =>
          authClient.signIn.social({
            provider: "google",
            callbackURL: "/workspaces",
            errorCallbackURL: "/sign-in",
          }),
        verifyAuthSession,
      );
      if (result.error) throw result.error;
      return;
    }
    const result = await duringAccountChange(
      async () =>
        action === "continue"
          ? authClient.signIn.emailOtp({ email, otp })
          : step === "totp"
            ? authClient.twoFactor.verifyTotp({ code: totp })
            : authClient.signIn.email({ email, password }),
      verifyAuthSession,
    );
    if (result.error) throw result.error;
    await finish(result.data);
  }
  async function submit(event?: React.FormEvent, action?: "continue" | "google") {
    event?.preventDefault();
    if (busy) return;
    setMessage(null);
    setBusy(true);
    try {
      if (action) await login(action);
      else if (step === "request") await requestCode();
      else if (step === "code") await verifyCode();
      else if (step === "password") await resetPassword();
      else await login();
    } catch (error) {
      const status =
        error && typeof error === "object" && "status" in error ? error.status : undefined;
      setMessage(
        t(
          status === 429
            ? "auth.rateLimited"
            : isAuthNotConfigured(error)
              ? "auth.notConfigured"
              : status === 503
                ? "auth.temporarilyUnavailable"
                : step === "request"
                  ? "auth.resetUnavailable"
                  : step === "login"
                    ? "auth.failed"
                    : "auth.otpInvalid",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  function changeStep(next: Step) {
    setStep(next);
    setOtp("");
    setPassword("");
    setConfirm("");
    setMessage(null);
  }
  return {
    step,
    email,
    password,
    confirm,
    otp,
    totp,
    message,
    busy,
    google,
    setEmail,
    setPassword,
    setConfirm,
    setOtp,
    setTotp,
    setStep,
    changeStep,
    submit,
  };
}

type Flow = ReturnType<typeof useSignInFlow>;

function SignIn() {
  const flow = useSignInFlow();
  const title =
    flow.step === "login"
      ? "auth.adminTitle"
      : flow.step === "choice"
        ? "auth.chooseAction"
        : flow.step === "password"
          ? "auth.resetTitle"
          : flow.step === "totp"
            ? "auth.totp"
            : "auth.recoveryTitle";
  return (
    <main className="mx-auto max-w-sm px-4 py-10 sm:px-6 sm:py-20">
      <h1 className="text-2xl font-bold">{t(title)}</h1>
      {flow.step === "choice" ? <RecoveryChoice flow={flow} /> : <SignInForm flow={flow} />}
      {flow.message && (
        <p role="status" className="mt-4 text-sm">
          {flow.message}
        </p>
      )}
      {flow.step === "login" && <GoogleSignIn flow={flow} />}
      <Button
        type="button"
        variant="link"
        className="mt-3 min-h-11 w-full"
        disabled={flow.busy}
        onClick={() => flow.changeStep(flow.step === "login" ? "request" : "login")}
      >
        {t(flow.step === "login" ? "auth.forgot" : "auth.backToSignIn")}
      </Button>
      {(flow.step === "code" || flow.step === "choice" || flow.step === "password") && (
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 w-full"
          disabled={flow.busy}
          onClick={() => flow.changeStep("request")}
        >
          {t("auth.resendOtp")}
        </Button>
      )}
    </main>
  );
}

interface FlowProps {
  flow: Flow;
}

function RecoveryChoice({ flow }: FlowProps) {
  return (
    <div className="mt-8 space-y-3">
      <Button
        className="h-11 w-full"
        disabled={flow.busy}
        onClick={() => void flow.submit(undefined, "continue")}
      >
        {t("auth.continue")}
      </Button>
      <Button
        variant="outline"
        className="h-11 w-full"
        disabled={flow.busy}
        onClick={() => flow.setStep("password")}
      >
        {t("auth.changePassword")}
      </Button>
    </div>
  );
}

function SignInForm({ flow }: FlowProps) {
  const passwordVisible = flow.step === "login" || flow.step === "password";
  const codeVisible = flow.step === "code" || flow.step === "totp";
  const submitKey =
    flow.step === "request"
      ? "auth.sendOtp"
      : flow.step === "code"
        ? "auth.verifyOtp"
        : flow.step === "password"
          ? "auth.savePassword"
          : flow.step === "totp"
            ? "auth.verifyTotp"
            : "auth.submit";
  return (
    <form onSubmit={flow.submit} className="mt-8 space-y-4">
      {flow.step !== "totp" && (
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium">
            {t("auth.email")}
          </label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={flow.email}
            disabled={flow.busy || !["login", "request"].includes(flow.step)}
            onChange={(e) => flow.setEmail(e.target.value)}
            className="h-11"
            dir="ltr"
          />
        </div>
      )}
      {passwordVisible && (
        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium">
            {t(flow.step === "password" ? "auth.newPassword" : "auth.password")}
          </label>
          <Input
            id="password"
            type="password"
            autoComplete={flow.step === "password" ? "new-password" : "current-password"}
            minLength={8}
            maxLength={128}
            required
            value={flow.password}
            disabled={flow.busy}
            onChange={(e) => flow.setPassword(e.target.value)}
            className="h-11"
            dir="ltr"
          />
        </div>
      )}
      {flow.step === "password" && (
        <div className="space-y-2">
          <label htmlFor="confirm" className="text-sm font-medium">
            {t("auth.confirmPassword")}
          </label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            required
            value={flow.confirm}
            disabled={flow.busy}
            onChange={(e) => flow.setConfirm(e.target.value)}
            className="h-11"
            dir="ltr"
          />
        </div>
      )}
      {codeVisible && (
        <div className="space-y-2">
          <label htmlFor="otp" className="text-sm font-medium">
            {t(flow.step === "totp" ? "auth.totp" : "auth.otp")}
          </label>
          <Input
            id="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={flow.step === "totp" ? flow.totp : flow.otp}
            disabled={flow.busy}
            onChange={(e) =>
              (flow.step === "totp" ? flow.setTotp : flow.setOtp)(e.target.value.replace(/\D/g, ""))
            }
            className="h-11 text-center"
            dir="ltr"
          />
        </div>
      )}
      <Button type="submit" className="h-11 w-full" disabled={flow.busy}>
        {t(flow.busy ? "auth.busy" : submitKey)}
      </Button>
    </form>
  );
}

function GoogleSignIn({ flow }: FlowProps) {
  return (
    <div className="mt-5">
      <Button
        variant="outline"
        className="google-sign-in h-11 w-full"
        disabled={flow.busy || !flow.google}
        onClick={() => void flow.submit(undefined, "google")}
      >
        <svg
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          className="!size-[18px]"
        >
          <path
            fill="#4285F4"
            d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
          />
          <path
            fill="#34A853"
            d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
          />
          <path
            fill="#FBBC05"
            d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
          />
          <path
            fill="#EA4335"
            d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
          />
        </svg>
        {t("auth.google")}
      </Button>
      {!flow.google && (
        <p className="mt-2 text-sm text-muted-foreground">{t("auth.googleUnavailable")}</p>
      )}
    </div>
  );
}
