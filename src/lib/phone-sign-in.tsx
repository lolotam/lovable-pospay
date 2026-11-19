import { useEffect, useState } from "react";
import { DeviceMobile } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { authClient, verifyAuthSession } from "./auth-client";
import { duringAccountChange } from "./account-change";

export interface PhoneSignInProps {
  disabled: boolean;
  onSuccess: (data: unknown) => Promise<void> | void;
}
export function PhoneSignIn({ disabled, onSuccess }: PhoneSignInProps) {
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => setAvailable(typeof window.PublicKeyCredential !== "undefined"), []);
  async function signIn() {
    if (busy || disabled) return;
    setBusy(true);
    setFailed(false);
    try {
      const result = await duringAccountChange(
        () => authClient.signIn.passkey(),
        verifyAuthSession,
      );
      if (result.error) throw new Error("PASSKEY_FAILED");
      await onSuccess(result.data);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  if (!available) return null;
  return (
    <div className="mt-4 space-y-2">
      <Button
        type="button"
        variant="outline"
        className="min-h-11 w-full whitespace-normal"
        disabled={disabled || busy}
        onClick={() => void signIn()}
      >
        <DeviceMobile aria-hidden weight="duotone" />
        {t("signIn.phone")}
      </Button>
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {t("signIn.passkeyFailed")}
        </p>
      )}
    </div>
  );
}
