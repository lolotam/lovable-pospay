import { LockKey, ShieldCheck } from "@phosphor-icons/react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import {
  editablePermissionSchema,
  restrictionKeySchema,
  type MemberPermissionsDto,
} from "../contracts";
import { effectivePermissions } from "../index";

export interface PermissionEditorProps {
  member: MemberPermissionsDto;
  locked: boolean;
  pending?: boolean;
  onRestrictionChange: (key: keyof MemberPermissionsDto["restrictions"], blocked: boolean) => void;
  onChange: (
    key: keyof MemberPermissionsDto["overrides"],
    state: "default" | "allow" | "deny",
  ) => void;
}
interface PermissionFieldProps extends PermissionEditorProps {
  permission: keyof MemberPermissionsDto["overrides"];
  allowed: boolean;
}
const STATES = ["default", "allow", "deny"] as const;
function PermissionField({
  member,
  locked,
  pending = false,
  onChange,
  permission,
  allowed,
}: PermissionFieldProps) {
  return (
    <fieldset disabled={locked || pending} className="min-w-0 space-y-2">
      <legend className="text-sm font-medium">{t(`permissionAdmin.${permission}`)}</legend>
      <p className="text-xs text-muted-foreground">
        {t(allowed ? "permissionAdmin.roleAllowed" : "permissionAdmin.roleDenied")}
      </p>
      {locked ? (
        <p className="text-sm">{t(`permissionAdmin.${member.overrides[permission]}`)}</p>
      ) : (
        <div
          role="group"
          aria-label={t(`permissionAdmin.${permission}`)}
          className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1"
        >
          {STATES.map((state) => (
            <Button
              key={state}
              type="button"
              variant={member.overrides[permission] === state ? "default" : "ghost"}
              className="min-h-11 min-w-0 px-1 text-xs"
              aria-pressed={member.overrides[permission] === state}
              onClick={() => onChange(permission, state)}
            >
              {t(`permissionAdmin.${state}`)}
            </Button>
          ))}
        </div>
      )}
    </fieldset>
  );
}
function RestrictionFields({
  member,
  locked,
  pending,
  onRestrictionChange,
}: PermissionEditorProps) {
  return (
    <section className="space-y-3 border-t border-border pt-4">
      <h3 className="text-sm font-medium">{t("permissionAdmin.restrictions")}</h3>
      {restrictionKeySchema.options.map((key) => (
        <label key={key} className="flex min-h-11 items-center justify-between gap-3">
          <span className="min-w-0 text-sm">
            <span className="block">{t(`permissionAdmin.${key}`)}</span>
            <span className="block text-xs text-muted-foreground">
              {t("permissionAdmin.blocked")}
            </span>
          </span>
          {locked ? (
            <span className="text-sm">{t(`permissionAdmin.${member.restrictions[key]}`)}</span>
          ) : (
            <Switch
              dir="ltr"
              className="relative after:absolute after:inset-0 after:-inset-y-3"
              aria-label={t(`permissionAdmin.${key}`)}
              checked={member.restrictions[key] === "deny"}
              disabled={pending}
              onCheckedChange={(blocked) => onRestrictionChange(key, blocked)}
            />
          )}
        </label>
      ))}
    </section>
  );
}
function ReadOnlyPermissions({ member }: { member: MemberPermissionsDto }) {
  return (
    <>
      <p className="flex items-center gap-2 border-t border-border pt-4 text-sm text-muted-foreground">
        <ShieldCheck aria-hidden weight="duotone" className="size-5 shrink-0" />
        {t("permissionAdmin.permissions.manage")}
      </p>
      {member.unknownKeys.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">{t("permissionAdmin.unknownKeys")}</h3>
          {member.unknownKeys.map((key) => (
            <p
              key={key}
              className="flex min-w-0 items-center gap-2 break-all text-sm text-muted-foreground"
            >
              <LockKey aria-hidden className="size-4 shrink-0" />
              {t("permissionAdmin.unknownRestriction")} · {key}
            </p>
          ))}
        </div>
      )}
    </>
  );
}
export function PermissionEditor(props: PermissionEditorProps) {
  const defaults = effectivePermissions(props.member.roles, []);
  return (
    <div className="space-y-4 border-t border-border pt-4">
      {editablePermissionSchema.options.map((permission) => (
        <PermissionField
          key={permission}
          {...props}
          permission={permission}
          allowed={defaults.includes(permission)}
        />
      ))}
      <RestrictionFields {...props} />
      <ReadOnlyPermissions member={props.member} />
    </div>
  );
}
