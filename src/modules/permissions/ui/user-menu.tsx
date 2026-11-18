import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { t } from "@/i18n";
import type { SessionContextDto } from "../contracts";

export interface UserMenuProps {
  user: SessionContextDto["user"];
  compact?: boolean;
}
export function UserMenu({ user, compact = false }: UserMenuProps) {
  const cache = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function signOut() {
    setBusy(true);
    setFailed(false);
    try {
      await cache.cancelQueries();
      const result = await authClient.signOut();
      if (result.error) throw result.error;
      cache.clear();
      await navigate({ to: "/", replace: true });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className={
        compact ? "flex min-w-0 items-center gap-1" : "space-y-2 border-t border-sidebar-border p-3"
      }
    >
      <div className="min-w-0 text-sm">
        <p className="truncate font-medium" title={user.name}>
          {user.name}
        </p>
        {!compact && (
          <p className="break-all text-xs text-muted-foreground" dir="ltr">
            {user.email}
          </p>
        )}
      </div>
      <Button
        variant="ghost"
        disabled={busy}
        onClick={() => void signOut()}
        title={t("auth.signOut")}
        aria-label={t("auth.signOut")}
        className={compact ? "size-11 shrink-0" : "min-h-11 w-full justify-start"}
      >
        <LogOut className="size-4" />
        {!compact && t("auth.signOut")}
      </Button>
      {failed && (
        <p role="alert" className="text-sm">
          {t("page.error")}
        </p>
      )}
    </div>
  );
}
