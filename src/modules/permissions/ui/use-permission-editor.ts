import { useState } from "react";
import type { MemberPermissionsDto, SaveOverridesInput } from "../contracts";

export interface PermissionPageData {
  companyId: string;
  actorId: string;
  members: MemberPermissionsDto[];
  save: (input: SaveOverridesInput) => Promise<MemberPermissionsDto>;
  refresh: () => Promise<unknown>;
}
type PermissionDraft = Pick<MemberPermissionsDto, "overrides" | "restrictions">;
export function usePermissionEditor({ companyId, members, save, refresh }: PermissionPageData) {
  const [drafts, setDrafts] = useState<Record<string, PermissionDraft>>({});
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
    ...(drafts[member.userId] ?? member),
  });
  const dirty = members.filter(
    (member) =>
      drafts[member.userId] &&
      JSON.stringify(drafts[member.userId]) !==
        JSON.stringify({ overrides: member.overrides, restrictions: member.restrictions }),
  );
  const { change, changeRestriction } = draftActions(setDrafts, setFeedback);
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
    changeRestriction,
    submit,
  };
}
export type PermissionEditorState = ReturnType<typeof usePermissionEditor>;

async function submitPermissionChanges(
  { companyId, save, refresh }: Pick<PermissionPageData, "companyId" | "save" | "refresh">,
  dirty: MemberPermissionsDto[],
  drafts: Record<string, PermissionDraft>,
  setDrafts: React.Dispatch<React.SetStateAction<Record<string, PermissionDraft>>>,
  setPending: (pending: boolean) => void,
  setFeedback: (feedback: "saved" | "failed" | "removed" | "forbidden" | null) => void,
) {
  setPending(true);
  setFeedback(null);
  let current: MemberPermissionsDto | undefined;
  try {
    for (const member of dirty) {
      current = member;
      await save({
        companyId,
        userId: member.userId,
        overrides: drafts[member.userId]?.overrides ?? member.overrides,
        restrictions: drafts[member.userId]?.restrictions ?? member.restrictions,
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
    const removedId = message === "MEMBER_NOT_FOUND" ? current?.userId : undefined;
    if (removedId)
      setDrafts((old) => {
        const next = { ...old };
        delete next[removedId];
        return next;
      });
  } finally {
    setPending(false);
  }
}

function draftActions(
  setDrafts: React.Dispatch<React.SetStateAction<Record<string, PermissionDraft>>>,
  setFeedback: (feedback: "saved" | "failed" | "removed" | "forbidden" | null) => void,
) {
  const change = (
    member: MemberPermissionsDto,
    key: keyof MemberPermissionsDto["overrides"],
    state: "default" | "allow" | "deny",
  ) => {
    setFeedback(null);
    setDrafts((old) => ({
      ...old,
      [member.userId]: {
        overrides: { ...(old[member.userId]?.overrides ?? member.overrides), [key]: state },
        restrictions: old[member.userId]?.restrictions ?? member.restrictions,
      },
    }));
  };
  const changeRestriction = (
    member: MemberPermissionsDto,
    key: keyof MemberPermissionsDto["restrictions"],
    blocked: boolean,
  ) => {
    setFeedback(null);
    setDrafts((old) => ({
      ...old,
      [member.userId]: {
        overrides: old[member.userId]?.overrides ?? member.overrides,
        restrictions: {
          ...(old[member.userId]?.restrictions ?? member.restrictions),
          [key]: blocked ? "deny" : "default",
        },
      },
    }));
  };
  return { change, changeRestriction };
}
