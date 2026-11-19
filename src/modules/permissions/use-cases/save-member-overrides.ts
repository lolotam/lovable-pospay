import type { MemberPermissionsDto, SaveOverridesInput } from "../contracts";
import { assertEditableTarget, toRows } from "../domain/override-states";
import type { PermissionAdminRepository } from "../ports/permission-admin-repository";
import { listMemberPermissions } from "./list-member-permissions";

export async function saveMemberOverrides(
  repository: PermissionAdminRepository,
  actorId: string,
  input: SaveOverridesInput,
): Promise<MemberPermissionsDto> {
  if (!(await repository.isOwner(input.companyId))) throw new Error("FORBIDDEN");
  await repository.lockTarget(input.companyId, input.userId);
  const target = (await repository.readMembers(input.companyId)).find(
    (member) => member.userId === input.userId,
  );
  if (!target) throw new Error("MEMBER_NOT_FOUND");
  assertEditableTarget({ actorId, target });
  await repository.replaceOverrides({
    companyId: input.companyId,
    userId: input.userId,
    rows: toRows(input.overrides, input.restrictions),
  });
  const fresh = (await listMemberPermissions(repository, input.companyId)).find(
    (member) => member.userId === input.userId,
  );
  if (!fresh) throw new Error("MEMBER_NOT_FOUND");
  return fresh;
}
