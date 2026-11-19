import { useState } from "react";
import type { MemberPermissionsDto, SaveOverridesInput } from "../contracts";

export interface PermissionPageData {
  companyId: string;
  actorId: string;
  members: MemberPermissionsDto[];
  save: (input: SaveOverridesInput) => Promise<MemberPermissionsDto>;
  refresh: () => Promise<unknown>;
}
export function usePermissionEditor({ companyId, members, save, refresh }: PermissionPageData) {
  const [drafts, setDrafts] = useState<Record<string, MemberPermissionsDto["overrides"]>>({});
  const [selectedId, setSelectedId] = useState(
    members.find((member) => !member.isOwner)?.userId ?? members[0]?.userId,
  );
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<"saved" | "failed" | "removed" | "forbidden" | null>(
    null,
  );
  const selected = members.find((member) => member.userId === selectedId) ?? members[0];
  const draftMember = (member: MemberPermissionsDto) => ({
    ...member,
    overrides: drafts[member.userId] ?? member.overrides,
  });
  const dirty = members.filter(
    (member) =>
      drafts[member.userId] &&
      JSON.stringify(drafts[member.userId]) !== JSON.stringify(member.overrides),
  );
  const change = (
    member: MemberPermissionsDto,
    key: keyof MemberPermissionsDto["overrides"],
    state: "default" | "allow" | "deny",
  ) => {
    setFeedback(null);
    setDrafts((old) => ({
      ...old,
      [member.userId]: { ...(old[member.userId] ?? member.overrides), [key]: state },
    }));
  };
  const submit = () =>
    submitPermissionChanges(
      { companyId, save, refresh },
      dirty,
      drafts,
      setDrafts,
      setPending,
      setFeedback,
    );
  return {
    selected,
    setSelectedId,
    expanded,
    setExpanded,
    pending,
    feedback,
    draftMember,
    dirty,
    change,
    submit,
  };
}
export type PermissionEditorState = ReturnType<typeof usePermissionEditor>;

async function submitPermissionChanges(
  { companyId, save, refresh }: Pick<PermissionPageData, "companyId" | "save" | "refresh">,
  dirty: MemberPermissionsDto[],
  drafts: Record<string, MemberPermissionsDto["overrides"]>,
  setDrafts: React.Dispatch<
    React.SetStateAction<Record<string, MemberPermissionsDto["overrides"]>>
  >,
  setPending: (pending: boolean) => void,
  setFeedback: (feedback: "saved" | "failed" | "removed" | "forbidden" | null) => void,
) {
  setPending(true);
  setFeedback(null);
  try {
    for (const member of dirty) {
      await save({
        companyId,
        userId: member.userId,
        overrides: drafts[member.userId] ?? member.overrides,
      });
      setDrafts((old) => {
        const next = { ...old };
        delete next[member.userId];
        return next;
      });
    }
    await refresh();
    setFeedback("saved");
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    setFeedback(
      message === "MEMBER_NOT_FOUND"
        ? "removed"
        : ["FORBIDDEN", "OWNER_LOCKED", "SELF_EDIT"].includes(message)
          ? "forbidden"
          : "failed",
    );
    try {
      await refresh();
    } catch {
      setFeedback("failed");
    }
    if (message === "MEMBER_NOT_FOUND") setDrafts({});
  } finally {
    setPending(false);
  }
}
