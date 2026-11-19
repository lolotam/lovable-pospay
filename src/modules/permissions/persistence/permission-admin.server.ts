import type { PoolClient } from "pg";
import type { CompanyRole } from "../contracts";
import { MANAGED_KEYS, type OverrideRow } from "../domain/override-states";
import type {
  PermissionAdminRepository,
  MemberOverrideRow,
} from "../ports/permission-admin-repository";

export async function readMembers(db: PoolClient, companyId: string) {
  const { rows } = await db.query<{
    user_id: string;
    name: string;
    email: string;
    roles: CompanyRole[];
  }>("select * from public.company_member_directory($1)", [companyId]);
  return rows.map((row) => ({
    userId: row.user_id,
    name: row.name,
    email: row.email,
    roles: row.roles,
  }));
}
export async function readOverrides(
  db: PoolClient,
  companyId: string,
): Promise<MemberOverrideRow[]> {
  const { rows } = await db.query<MemberOverrideRow>(
    'select user_id as "userId", permission, effect from public.permission_overrides where company_id=$1 order by user_id, permission, effect',
    [companyId],
  );
  return rows;
}

export async function replaceOverrides(
  db: PoolClient,
  actorId: string,
  input: {
    companyId: string;
    userId: string;
    rows: OverrideRow[];
  },
): Promise<void> {
  const { rows: before } = await db.query<OverrideRow>(
    "select permission, effect from public.permission_overrides where company_id=$1 and user_id=$2 order by permission, effect",
    [input.companyId, input.userId],
  );
  await db.query(
    "delete from public.permission_overrides where company_id=$1 and user_id=$2 and permission=any($3::text[])",
    [input.companyId, input.userId, MANAGED_KEYS],
  );
  for (const row of input.rows) {
    await db.query(
      "insert into public.permission_overrides(company_id,user_id,permission,effect) values($1,$2,$3,$4)",
      [input.companyId, input.userId, row.permission, row.effect],
    );
  }
  const { rows: after } = await db.query<OverrideRow>(
    "select permission, effect from public.permission_overrides where company_id=$1 and user_id=$2 order by permission, effect",
    [input.companyId, input.userId],
  );
  await db.query(
    "insert into public.audit_log(company_id,actor_user_id,action,entity,entity_id,details) values($1,$2,'permissions.changed','user',$3,$4::jsonb)",
    [input.companyId, actorId, input.userId, JSON.stringify({ before, after })],
  );
}

export function pgPermissionAdminRepository(
  db: PoolClient,
  actorId: string,
): PermissionAdminRepository {
  return {
    async isOwner(companyId) {
      const { rows } = await db.query<{ allowed: boolean }>(
        "select public.has_company_role($1,'owner') as allowed",
        [companyId],
      );
      return rows[0]?.allowed === true;
    },
    readMembers: (companyId) => readMembers(db, companyId),
    readOverrides: (companyId) => readOverrides(db, companyId),
    async lockTarget(companyId, userId) {
      // قفل المعاملة يسلسل حفظ مالكين للشخص نفسه، حتى عندما لا توجد تجاوزات بعد.
      await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `${companyId}:${userId}`,
      ]);
      await db.query(
        "select id from public.memberships where company_id=$1 and user_id=$2 order by id for update",
        [companyId, userId],
      );
    },
    replaceOverrides: (input) => replaceOverrides(db, actorId, input),
  };
}
