import type { MemberPermissionsDto, PermissionKey } from "../contracts";
import { effectivePermissions, ROLE_DEFAULTS } from "../domain/permission-matrix";
import { toStates } from "../domain/override-states";
import type { PermissionAdminRepository } from "../ports/permission-admin-repository";

export async function listMemberPermissions(
  repository: PermissionAdminRepository,
  companyId: string,
): Promise<MemberPermissionsDto[]> {
  if (!(await repository.isOwner(companyId))) throw new Error("FORBIDDEN");
  const members = await repository.readMembers(companyId);
  const overrides = await repository.readOverrides(companyId);
  const known = new Set<string>(ROLE_DEFAULTS.owner);
  return members.map((member) => {
    const rows = overrides.filter((row) => row.userId === member.userId);
    const current = rows.filter((row): row is typeof row & { permission: PermissionKey } =>
      known.has(row.permission),
    );
    return {
      ...member,
      isOwner: member.roles.includes("owner"),
      overrides: toStates(rows),
      otherRestrictions: [
        ...new Set(
          rows
            .filter((row) => !known.has(row.permission) && row.effect === "deny")
            .map((row) => row.permission),
        ),
      ],
      effective: effectivePermissions(member.roles, current),
    };
  });
}
