import { forwardRef } from "react";
import { CaretDown, Check, LockKey, User } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";
import type { MemberPermissionsDto } from "../contracts";
import { PermissionEditor, type PermissionEditorProps } from "./permission-fields";

export interface MemberPermissionCardProps extends Omit<
  React.HTMLAttributes<HTMLElement>,
  "onChange"
> {
  member: MemberPermissionsDto;
  actorId: string;
  expanded: boolean;
  selected?: boolean;
  pending?: boolean;
  variant?: "card" | "list";
  onSelect: () => void;
  onChange: PermissionEditorProps["onChange"];
}
function MemberSummary({
  member,
  locked,
  selected,
  expanded,
  onSelect,
}: {
  member: MemberPermissionsDto;
  locked: boolean;
  selected: boolean;
  expanded: boolean;
  onSelect: () => void;
}) {
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        onClick={onSelect}
        aria-expanded={expanded}
        className="h-auto min-h-11 w-full justify-start gap-3 whitespace-normal px-0 text-start"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <User aria-hidden weight="duotone" className="size-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block break-words font-medium">{member.name}</span>
          <span className="block break-all text-xs text-muted-foreground">{member.email}</span>
        </span>
        {selected ? (
          <Check aria-hidden className="size-5 shrink-0 text-primary" />
        ) : (
          <CaretDown aria-hidden className="size-5 shrink-0" />
        )}
      </Button>
      <p className="mt-3 text-xs text-muted-foreground">
        {member.roles.map((role) => t(`ws.role.${role}`)).join(" · ")}
      </p>
      {locked && (
        <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
          <LockKey aria-hidden className="size-4" />
          {t(member.isOwner ? "permissionAdmin.ownerLocked" : "permissionAdmin.selfLocked")}
        </p>
      )}
    </>
  );
}
export const MemberPermissionCard = forwardRef<HTMLElement, MemberPermissionCardProps>(
  function MemberPermissionCard(
    {
      member,
      actorId,
      expanded,
      selected = false,
      pending = false,
      variant = "card",
      onSelect,
      onChange,
      className,
      ...props
    },
    ref,
  ) {
    const locked = member.isOwner || actorId === member.userId;
    return (
      <article
        ref={ref}
        {...props}
        className={cn(
          "min-w-0 rounded-lg border bg-card p-4 text-card-foreground",
          selected ? "border-primary" : "border-border",
          className,
        )}
      >
        <MemberSummary
          member={member}
          locked={locked}
          selected={selected}
          expanded={expanded}
          onSelect={onSelect}
        />
        {expanded && variant === "card" && (
          <div className="mt-4">
            <PermissionEditor
              member={member}
              locked={locked}
              pending={pending}
              onChange={onChange}
            />
          </div>
        )}
      </article>
    );
  },
);
