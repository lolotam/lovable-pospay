import type pg from "pg";
import type { DiscountSettingsDto } from "../contracts";

type Target = { kind: "role"; role: string } | { kind: "user"; userId: string };

export async function readDiscountSettings(
  db: pg.PoolClient,
  companyId: string,
): Promise<DiscountSettingsDto> {
  const ok = await db.query(`select public.discount_manager($1) as ok`, [companyId]);
  if (!ok.rows[0]?.ok) return { canManage: false, grants: [], members: [] };
  const grants = await db.query(
    `select g.id,g.role::text as role,g.user_id as "userId",g.max_percent as "maxPercent",s.display_name as name
 from public.discount_grants g left join public.staff_members s on s.company_id=g.company_id and s.user_id=g.user_id
 where g.company_id=$1 order by g.role nulls last, s.display_name`,
    [companyId],
  );
  const members = await db.query(
    `select user_id as "userId",display_name as name from public.staff_members
 where company_id=$1 and user_id is not null order by display_name`,
    [companyId],
  );
  return { canManage: true, grants: grants.rows, members: members.rows };
}

export async function saveDiscountGrant(
  db: pg.PoolClient,
  userId: string,
  companyId: string,
  target: Target,
  maxPercent: number,
): Promise<void> {
  const col = target.kind === "role" ? "role" : "user_id";
  const value = target.kind === "role" ? target.role : target.userId;
  const r = await db.query(
    `insert into public.discount_grants(company_id,${col},max_percent,granted_by) values($1,$2,$3,$4)
 on conflict (company_id,${col}) where ${col} is not null do update set max_percent=excluded.max_percent,granted_by=excluded.granted_by returning id`,
    [companyId, value, maxPercent, userId],
  );
  await audit(db, userId, companyId, "discount.granted", r.rows[0].id, { target, maxPercent });
}

export async function revokeDiscountGrant(
  db: pg.PoolClient,
  userId: string,
  companyId: string,
  id: string,
): Promise<void> {
  const r = await db.query(
    `delete from public.discount_grants where company_id=$1 and id=$2 returning id`,
    [companyId, id],
  );
  if (!r.rowCount) throw new Error("FORBIDDEN");
  await audit(db, userId, companyId, "discount.revoked", id, {});
}

async function audit(
  db: pg.PoolClient,
  userId: string,
  companyId: string,
  action: string,
  id: string,
  details: unknown,
) {
  await db.query(
    `insert into public.audit_log(company_id,actor_user_id,action,entity,entity_id,details) values($1,$2,$3,'discount_grant',$4,$5)`,
    [companyId, userId, action, id, JSON.stringify(details)],
  );
}
