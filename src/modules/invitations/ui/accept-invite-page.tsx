import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t, type MessageKey } from "@/i18n";
import type { InvitePreviewDto } from "../contracts";
import { acceptInviteFn, previewInviteFn } from "../functions/invitation.functions";

const known = ["INVITE_INVALID", "ACCOUNT_EXISTS", "INVITE_EMAIL_MISMATCH"];

export function AcceptInvitePage({ token }: { token: string }) {
  const preview = useServerFn(previewInviteFn);
  const accept = useServerFn(acceptInviteFn);
  const [invite, setInvite] = useState<InvitePreviewDto | null | undefined>(undefined);
  const [f, setF] = useState({ name: "", password: "", confirm: "" });
  const [state, setState] = useState<"form" | "busy" | "done">("form");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return setInvite(null);
    preview({ data: { token } }).then(setInvite, () => setInvite(null));
  }, [token, preview]);
  if (invite === undefined) return <p>{t("invite.loading")}</p>;
  if (!invite) return <p role="alert">{t("invite.INVITE_INVALID")}</p>;
  if (state === "done")
    return (
      <div className="space-y-3">
        <p role="status">{t("invite.done")}</p>
        <Button asChild>
          <Link to="/sign-in">{t("invite.signIn")}</Link>
        </Button>
      </div>
    );
  async function submit() {
    setError("");
    if (f.password !== f.confirm) return setError(t("invite.mismatch"));
    setState("busy");
    try {
      await accept({ data: { token, name: f.name, password: f.password } });
      setState("done");
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      setError(t(known.includes(code) ? (`invite.${code}` as MessageKey) : "team.error"));
      setState("form");
    }
  }
  return (
    <form
      className="max-w-md space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <p>
        {t("invite.intro")} <strong>{invite.companyName}</strong> ·{" "}
        {t(`team.role.${invite.role}` as MessageKey)}
      </p>
      <p dir="ltr" className="text-muted-foreground">
        {invite.email}
      </p>
      <label className="block space-y-2">
        <span>{t("invite.name")}</span>
        <Input
          required
          maxLength={120}
          value={f.name}
          onChange={(e) => setF({ ...f, name: e.target.value })}
        />
      </label>
      <label className="block space-y-2">
        <span>{t("invite.password")}</span>
        <Input
          dir="ltr"
          type="password"
          required
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
          value={f.password}
          onChange={(e) => setF({ ...f, password: e.target.value })}
        />
      </label>
      <label className="block space-y-2">
        <span>{t("invite.confirm")}</span>
        <Input
          dir="ltr"
          type="password"
          required
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
          value={f.confirm}
          onChange={(e) => setF({ ...f, confirm: e.target.value })}
        />
      </label>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <Button disabled={state === "busy"}>{t("invite.create")}</Button>
    </form>
  );
}
