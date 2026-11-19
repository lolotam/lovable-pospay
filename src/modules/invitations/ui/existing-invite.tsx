import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { t, type MessageKey } from "@/i18n";
import type { SessionContextDto } from "@/modules/permissions";
import { areaForWorkspace } from "@/modules/permissions";
import { chooseWorkspace, sessionContextQuery } from "@/modules/permissions/ui/use-session-context";
import { acceptInviteAsSignedInFn } from "../functions/invitation.functions";
import type { InvitePreviewDto } from "../contracts";

export interface ExistingInviteProps {
  token: string;
  invite: InvitePreviewDto;
  context: SessionContextDto;
}
export function ExistingInvite({ token, invite, context }: ExistingInviteProps) {
  const accept = useServerFn(acceptInviteAsSignedInFn);
  const cache = useQueryClient();
  const navigate = useNavigate();
  const [joinedCompany, setJoinedCompany] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // A join that resolves after the user left this invitation must not switch workspace or navigate.
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, [token]);
  const matches = context.user.email.trim().toLowerCase() === invite.email.trim().toLowerCase();
  async function join() {
    setBusy(true);
    setError("");
    try {
      const companyId = joinedCompany ?? (await accept({ data: { token } })).companyId;
      setJoinedCompany(companyId);
      const fresh = await cache.fetchQuery(sessionContextQuery);
      const workspace = fresh?.workspaces.find(
        (ws) => ws.kind === "company" && ws.companyId === companyId && ws.role === invite.role,
      );
      if (!fresh || !workspace) throw new Error("WORKSPACE_UNAVAILABLE");
      if (!active.current) return;
      await chooseWorkspace(cache, fresh, workspace);
      if (!active.current) return;
      await navigate({ href: `/${areaForWorkspace(workspace)}`, replace: true });
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      setError(
        t(
          ["INVITE_INVALID", "INVITE_EMAIL_MISMATCH"].includes(code)
            ? (`invite.${code}` as MessageKey)
            : "team.error",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    setBusy(true);
    try {
      await cache.cancelQueries();
      const result = await authClient.signOut();
      if (result.error) throw result.error;
      cache.clear();
      await navigate({ to: "/invite", search: { t: token }, replace: true, reloadDocument: true });
    } catch {
      setError(t("team.error"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="min-w-0 space-y-4">
      <p className="break-words">{invite.companyName}</p>
      {(!matches || error) && (
        <p role="alert" className="text-destructive">
          {error || t("invite.INVITE_EMAIL_MISMATCH")}
        </p>
      )}
      <Button
        className="min-h-11 w-full whitespace-normal"
        disabled={busy}
        onClick={() => void (matches ? join() : signOut())}
      >
        {t(matches ? "invite.join" : "invite.signOut").replace(
          "{company}",
          () => invite.companyName,
        )}
      </Button>
    </section>
  );
}
