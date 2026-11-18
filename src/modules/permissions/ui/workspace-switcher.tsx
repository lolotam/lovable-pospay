import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import type { SessionContextDto, WorkspaceDto } from "../contracts";
import { areaForWorkspace } from "../domain/workspace";
import { chooseWorkspace } from "./use-session-context";

export function workspaceLabel(ws: WorkspaceDto) {
  return ws.kind === "platform"
    ? t("ws.platform")
    : `${ws.companyName} — ${t(`ws.role.${ws.role}`)}`;
}

export interface WorkspaceSwitcherProps {
  context: SessionContextDto;
}
export function WorkspaceSwitcher({ context }: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const cache = useQueryClient();
  const navigate = useNavigate();
  const label = context.active ? workspaceLabel(context.active) : t("ws.title");
  async function select(ws: WorkspaceDto) {
    setBusy(true);
    try {
      await chooseWorkspace(cache, context, ws);
      setOpen(false);
      await navigate({ to: `/${areaForWorkspace(ws)}` });
    } finally {
      setBusy(false);
    }
  }
  if (context.workspaces.length < 2)
    return <p className="px-2 py-3 text-sm break-words">{label}</p>;
  return (
    <div className="space-y-1">
      <Button
        variant="ghost"
        className="min-h-11 h-auto w-full justify-between whitespace-normal text-start"
        aria-expanded={open}
        aria-controls="workspace-options"
        onClick={() => setOpen(!open)}
      >
        <span className="min-w-0 break-words">{label}</span>
        <ChevronsUpDown className="shrink-0 size-4" />
      </Button>
      {open && (
        <div
          id="workspace-options"
          className="space-y-1 border-s border-sidebar-border ps-2"
          aria-label={t("ws.switch")}
        >
          {context.workspaces.map((ws, i) => (
            <Button
              key={i}
              variant="ghost"
              disabled={busy}
              className="min-h-11 h-auto w-full justify-start whitespace-normal text-start"
              onClick={() => void select(ws)}
            >
              {workspaceLabel(ws)}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
