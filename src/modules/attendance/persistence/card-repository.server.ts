import type pg from "pg";
import type { CardManagement } from "../card.contracts";
export async function cardHash(token: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Buffer.from(hash).toString("hex");
}
export async function readCardAccess(db: pg.PoolClient, companyId: string) {
  const access = await db.query<{ member: boolean; manager: boolean }>(
    `select public.is_member($1) as member, public.card_manager($1) as manager`,
    [companyId],
  );
  return access.rows[0];
}

export async function readCards(
  db: pg.PoolClient,
  companyId: string,
): Promise<Omit<CardManagement, "canApprove">> {
  const policy = await db.query(
    `select approved_at from public.card_policies where company_id=$1`,
    [companyId],
  );
  const staff = await db.query(
    `select s.id,s.display_name as name,s.branch_id as "branchId",b.name as "branchName",
 exists(select 1 from public.phone_bindings p where p.company_id=s.company_id and p.user_id=s.user_id) as phone,
 c.id as "cardId",public.card_manager(s.company_id,s.branch_id) as "canIssue"
 from public.staff_members s join public.branches b on b.id=s.branch_id and b.company_id=s.company_id
 left join public.attendance_cards c on c.company_id=s.company_id and c.staff_id=s.id and c.revoked_at is null
 where s.company_id=$1 and (public.card_manager(s.company_id,s.branch_id) or public.has_company_role(s.company_id,'owner')) order by s.display_name`,
    [companyId],
  );
  return {
    approvedAt: policy.rows[0]?.approved_at?.toISOString() ?? null,
    staff: staff.rows,
  };
}
export async function insertCardPolicy(db: pg.PoolClient, userId: string, companyId: string) {
  const result = await db.query(
    `insert into public.card_policies(company_id,approved_by) values($1,$2) on conflict do nothing returning company_id`,
    [companyId, userId],
  );
  return !!result.rowCount;
}
export async function cardAudit(
  db: pg.PoolClient,
  userId: string,
  companyId: string,
  action: string,
  id: string,
  details: unknown,
) {
  await db.query(
    `insert into public.audit_log(company_id,actor_user_id,action,entity,entity_id,details) values($1,$2,$3,'attendance_card',$4,$5)`,
    [companyId, userId, action, id, JSON.stringify(details)],
  );
}
export async function lockCardStaff(db: pg.PoolClient, companyId: string, staffId: string) {
  const result = await db.query(
    `select s.id,s.display_name as name,s.branch_id as "branchId",s.user_id,
 public.card_manager(s.company_id,s.branch_id) as manager from public.staff_members s where s.company_id=$1 and s.id=$2 for update`,
    [companyId, staffId],
  );
  if (!result.rows[0]) throw new Error("FORBIDDEN");
  return result.rows[0];
}
