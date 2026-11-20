import type { MemberPermissionsDto, SaveOverridesInput } from "../contracts";
import {
  EDITABLE_PERMISSIONS,
  assertEditableTarget,
  permissionApplicable,
  toRows,
} from "../domain/override-states";
import type { PermissionCompanyRole } from "../domain/permission-admin-types";
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
  assertApplicableKeys(target.roles, input.overrides);
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

/** يرفض حالة غير افتراضية لمفتاح لا يسري على أدوار العضو، قبل أي كتابة (020 D1، 021 O4). */
function assertApplicableKeys(
  roles: readonly PermissionCompanyRole[],
  overrides: SaveOverridesInput["overrides"],
): void {
  const changed = EDITABLE_PERMISSIONS.filter((key) => overrides[key] !== "default");
  if (changed.some((key) => !permissionApplicable(key, roles)))
    throw new Error("PERMISSION_NOT_APPLICABLE");
}
