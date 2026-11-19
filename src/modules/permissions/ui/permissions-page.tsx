import { Link } from "@tanstack/react-router";
import { FloppyDisk, ShieldCheck } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { usePermissionEditor, type PermissionPageData } from "./use-permission-editor";
import { PermissionCards, PermissionDesktop } from "./permission-layouts";

export interface PermissionsPageProps extends PermissionPageData {
  companyId: string;
}
export function PermissionsPage(props: PermissionsPageProps) {
  const editor = usePermissionEditor(props);
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 md:p-6 lg:p-8">
      <header className="flex items-center gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <ShieldCheck aria-hidden weight="duotone" className="size-7" />
        </span>
        <div>
          <h1 className="text-2xl">{t("permissionAdmin.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("permissionAdmin.description")}</p>
        </div>
      </header>
      {props.members.every((member) => member.isOwner) && (
        <div className="space-y-2 border-b border-border pb-4">
          <p>{t("permissionAdmin.empty")}</p>
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/app/staff/team">{t("permissionAdmin.invite")}</Link>
          </Button>
        </div>
      )}
      <PermissionCards {...props} editor={editor} />
      <PermissionDesktop {...props} editor={editor} />
      <div className="sticky [inset-block-end:calc(5.75rem+env(safe-area-inset-bottom))] z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 shadow-lg md:[inset-block-end:1rem]">
        <p
          role="status"
          aria-live="polite"
          className="min-w-0 flex-1 text-sm text-muted-foreground"
        >
          {editor.feedback ? t(`permissionAdmin.${editor.feedback}`) : t("permissionAdmin.title")}
        </p>
        <Button
          onClick={() => void editor.submit()}
          disabled={!editor.dirty.length || editor.pending}
          className="min-h-11"
        >
          <FloppyDisk aria-hidden weight="duotone" />
          {t(editor.pending ? "permissionAdmin.saving" : "permissionAdmin.save")}
        </Button>
      </div>
    </main>
  );
}
