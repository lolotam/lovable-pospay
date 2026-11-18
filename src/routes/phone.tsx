import { isAuthNotConfigured } from "@/lib/auth-errors";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { startAuthentication } from "@simplewebauthn/browser";
import { authClient } from "@/lib/auth-client";
import {
  startBindingFn,
  finishBindingFn,
  unbindPhoneFn,
} from "@/modules/staff/functions/phone.functions";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

export const Route = createFileRoute("/phone")({
  head: () => ({
    meta: [
      { title: "ربط الهاتف — PosPay" },
      { name: "description", content: "إدارة هاتف الموظفة المرتبط بالحضور." },
      { property: "og:title", content: "ربط الهاتف — PosPay" },
      { property: "og:description", content: "إدارة هاتف الموظفة المرتبط بالحضور." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PhonePage,
});

function PhonePage() {
  const [companyId, setCompany] = useState("");
  const [userId, setUser] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const begin = useServerFn(startBindingFn);
  const finish = useServerFn(finishBindingFn);
  const unbind = useServerFn(unbindPhoneFn);
  async function run(remove: boolean) {
    setBusy(true);
    setMessage("");
    try {
      if (remove) await unbind({ data: { companyId, userId } });
      else {
        const added = await authClient.passkey.addPasskey({ authenticatorAttachment: "platform" });
        if (added?.error)
          throw new Error(isAuthNotConfigured(added.error) ? "AUTH_NOT_CONFIGURED" : "PASSKEY_FAILED");
        const proof = await begin({ data: { companyId } });
        const response = await startAuthentication({ optionsJSON: proof.options });
        await finish({ data: { companyId, challengeId: proof.challengeId, response } });
      }
      setMessage(t("phone.success"));
    } catch (e) {
      setMessage(t(isAuthNotConfigured(e) ? "auth.notConfigured" : "phone.error"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-lg px-4 py-8 sm:px-6 sm:py-16 space-y-6">
      <Link to="/">{t("app.name")}</Link>
      <h1 className="text-2xl font-bold">{t("phone.title")}</h1>
      <label className="block">
        {t("phone.company")}
        <input
          className="mt-2 w-full border border-input rounded-md p-3"
          value={companyId}
          onChange={(e) => setCompany(e.target.value)}
          dir="ltr"
        />
      </label>
      <Button disabled={busy || !companyId} onClick={() => run(false)}>
        {t("phone.bind")}
      </Button>
      <label className="block">
        {t("phone.user")}
        <input
          className="mt-2 w-full border border-input rounded-md p-3"
          value={userId}
          onChange={(e) => setUser(e.target.value)}
          dir="ltr"
        />
      </label>
      <Button
        variant="destructive"
        disabled={busy || !companyId || !userId}
        onClick={() => run(true)}
      >
        {t("phone.unbind")}
      </Button>
      <p role="status">{message}</p>
    </main>
  );
}
