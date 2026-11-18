import { Link } from "@tanstack/react-router";
import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import type { WorkspaceDto } from "../contracts";
import { areaForWorkspace } from "../domain/workspace";

export interface NoAccessProps {
  workspace: WorkspaceDto | null;
}
export function NoAccess({ workspace }: NoAccessProps) {
  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 py-16">
      <ShieldX className="size-8 text-muted-foreground" aria-hidden />
      <h1 className="text-2xl font-bold">{t("access.denied.title")}</h1>
      <p className="text-muted-foreground">{t("access.denied.body")}</p>
      <Button asChild className="min-h-11">
        <Link to={workspace ? `/${areaForWorkspace(workspace)}` : "/workspaces"}>
          {t("access.denied.home")}
        </Link>
      </Button>
    </main>
  );
}
