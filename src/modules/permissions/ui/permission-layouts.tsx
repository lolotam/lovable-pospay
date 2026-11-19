import { t } from "@/i18n";
import { MemberPermissionCard } from "./member-permission-card";
import { PermissionEditor } from "./permission-fields";
import type { PermissionEditorState, PermissionPageData } from "./use-permission-editor";
export interface PermissionLayoutProps extends PermissionPageData {
  editor: PermissionEditorState;
}
export function PermissionCards({ members, actorId, editor }: PermissionLayoutProps) {
  return (
    <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 lg:hidden">
      {members.map((member) => (
        <MemberPermissionCard
          key={member.userId}
          member={editor.draftMember(member)}
          actorId={actorId}
          pending={editor.pending}
          expanded={editor.expanded[member.userId] ?? !member.isOwner}
          onSelect={() =>
            editor.setExpanded((old) => ({
              ...old,
              [member.userId]: !(old[member.userId] ?? !member.isOwner),
            }))
          }
          onChange={(key, state) => editor.change(member, key, state)}
        />
      ))}
    </div>
  );
}
export function PermissionDesktop({ members, actorId, editor }: PermissionLayoutProps) {
  const { selected } = editor;
  return (
    <div className="hidden min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-start gap-6 lg:grid">
      <section className="min-w-0 space-y-3" aria-label={t("permissionAdmin.members")}>
        {members.map((member) => (
          <MemberPermissionCard
            key={member.userId}
            variant="list"
            member={member}
            actorId={actorId}
            expanded={false}
            selected={selected?.userId === member.userId}
            onSelect={() => editor.setSelectedId(member.userId)}
            onChange={(key, state) => editor.change(member, key, state)}
          />
        ))}
      </section>
      {selected && (
        <section className="min-w-0 space-y-4" aria-label={selected.name}>
          <h2 className="text-xl">{selected.name}</h2>
          <PermissionEditor
            member={editor.draftMember(selected)}
            locked={selected.isOwner || actorId === selected.userId}
            pending={editor.pending}
            onChange={(key, state) => editor.change(selected, key, state)}
          />
        </section>
      )}
    </div>
  );
}
