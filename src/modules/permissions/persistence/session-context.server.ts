import type pg from "pg";
import { permissionKeySchema, workspaceSchema } from "../contracts";
import type { SessionContextRepository } from "../ports/session-context-repository";
import type { PermissionOverride } from "../domain/permission-matrix";
export function pgSessionContextRepository(
  db: pg.PoolClient,
  userId: string,
): SessionContextRepository {
  return {
    async listCompanyWorkspaces() {
      const { rows } = await db.query(
        `select c.id as "companyId",c.name as "companyName",c.business_type as "businessType",m.role::text as role,m.branch_id as "branchId",b.name as "branchName" from public.memberships m join public.companies c on c.id=m.company_id left join public.branches b on b.company_id=m.company_id and b.id=m.branch_id where m.user_id=$1 order by c.name,m.role`,
        [userId],
      );
      return rows.map((row) => workspaceSchema.options[1].parse({ kind: "company", ...row }));
    },
    async isPlatformAdmin() {
      return (
        (await db.query<{ allowed: boolean }>("select public.is_super_admin() as allowed")).rows[0]
          ?.allowed === true
      );
    },
    async listOverrides(companyId) {
      const { rows } = await db.query<{ permission: string; effect: string }>(
        "select permission,effect from public.permission_overrides where company_id=$1 and user_id=$2",
        [companyId, userId],
      );
      return rows.flatMap((row) => {
        const key = permissionKeySchema.safeParse(row.permission);
        return key.success && (row.effect === "allow" || row.effect === "deny")
          ? [{ permission: key.data, effect: row.effect } satisfies PermissionOverride]
          : [];
      });
    },
  };
}
