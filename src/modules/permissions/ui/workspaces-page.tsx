import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Building2, ArrowUpLeft, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import type { SessionContextDto, WorkspaceDto } from "../contracts";
import { areaForWorkspace, safeRedirectPath } from "../domain/workspace";
import { pageAllowed } from "./area-guard";
import { chooseWorkspace, sessionContextQuery } from "./use-session-context";
import { UserMenu } from "./user-menu";

export interface WorkspacesPageProps {
  context: SessionContextDto;
  redirect?: string | undefined;
}
export function WorkspacesPage({ context, redirect }: WorkspacesPageProps) {
  const cache = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  async function select(ws: WorkspaceDto) {
    setBusy(true);
    try {
      await chooseWorkspace(cache, context, ws);
      const requested = safeRedirectPath(redirect);
      const session = requested ? await cache.fetchQuery(sessionContextQuery) : null;
      if (requested && session && pageAllowed(session, requested.split("?")[0] ?? ""))
        await navigate({ href: requested });
      else await navigate({ to: `/${areaForWorkspace(ws)}` });
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-16">
      <Link to="/" className="text-lg font-bold">
        {t("app.name")}
      </Link>
      <h1 className="mt-8 text-3xl font-bold">{t("ws.title")}</h1>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {context.workspaces.map((ws, i) => (
          <Button
            key={i}
            variant="outline"
            disabled={busy}
            onClick={() => void select(ws)}
            className="h-auto min-h-36 items-start justify-start gap-4 whitespace-normal p-5 text-start"
          >
            {ws.kind === "platform" ? (
              <Shield className="size-6 shrink-0" />
            ) : (
              <Building2 className="size-6 shrink-0" />
            )}
            <span className="min-w-0 flex-1 space-y-2">
              <span className="block text-lg font-bold break-words">
                {ws.kind === "platform" ? t("ws.platform") : ws.companyName}
              </span>
              {ws.kind === "company" && (
                <>
                  <span className="block text-sm text-muted-foreground">
                    {t(`ws.role.${ws.role}`)} · {t(`ws.type.${ws.businessType}`)}
                  </span>
                  {ws.branchName && (
                    <span className="block text-sm break-words">{ws.branchName}</span>
                  )}
                </>
              )}
            </span>
            <ArrowUpLeft className="size-4 shrink-0" />
          </Button>
        ))}
      </div>
      {!context.workspaces.length && <p className="my-8 text-muted-foreground">{t("ws.empty")}</p>}
      <div className="mt-8 max-w-sm">
        <UserMenu user={context.user} />
      </div>
    </main>
  );
}
