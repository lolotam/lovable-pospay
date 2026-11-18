import type pg from "pg";
import type { InviteDto, InvitePreviewDto, TeamDto } from "../contracts";

export async function readTeam(db: pg.PoolClient, companyId: string): Promise<TeamDto> {
  const r = await db.query(
    `select public.has_company_role($1,'owner') as owner, public.has_company_role($1,'branch_manager') as manager`,
    [companyId],
  );
  const { owner, manager } = r.rows[0] ?? {};
  if (!owner && !manager) return { canInvite: false, isOwner: false, branches: [], invites: [] };
  const branches = await db.query(
    `select id,name from public.branches where company_id=$1 order by name`,
    [companyId],
  );
  const invites = await db.query<InviteDto>(
    `select i.id,i.email,i.role::text as role,b.name as branch,i.expires_at as "expiresAt",
 case when i.accepted_at is not null then 'accepted' when i.revoked_at is not null then 'revoked'
  when i.expires_at<=now() then 'expired' else 'pending' end as status
 from public.invitations i left join public.branches b on b.id=i.branch_id
 where i.company_id=$1 order by i.created_at desc limit 200`,
    [companyId],
  );
  return {
    canInvite: true,
    isOwner: Boolean(owner),
    branches: branches.rows,
    invites: invites.rows,
  };
}

export async function insertInvite(
  db: pg.PoolClient,
  v: {
    companyId: string;
    email: string;
    role: string;
    branchId: string | null;
    tokenHash: string;
    expiresAt: Date;
    userId: string;
  },
): Promise<{ id: string; companyName: string }> {
  await db.query(
    `update public.invitations set revoked_at=now() where company_id=$1 and email=$2 and accepted_at is null and revoked_at is null and expires_at<=now()`,
    [v.companyId, v.email],
  );
  const r = await db.query(
    `insert into public.invitations(company_id,email,role,branch_id,token_hash,expires_at,invited_by)
 values($1,$2,$3,$4,$5,$6,$7) returning id,(select name from public.companies where id=$1) as "companyName"`,
    [v.companyId, v.email, v.role, v.branchId, v.tokenHash, v.expiresAt, v.userId],
  );
  await audit(db, v.companyId, v.userId, "invitation.created", r.rows[0].id, { role: v.role });
  return r.rows[0];
}

export async function revokeInvite(
  db: pg.PoolClient,
  companyId: string,
  id: string,
  userId: string,
) {
  const r = await db.query(
    `update public.invitations set revoked_at=now() where company_id=$1 and id=$2 and accepted_at is null and revoked_at is null returning id`,
    [companyId, id],
  );
  if (!r.rowCount) throw new Error("FORBIDDEN");
  await audit(db, companyId, userId, "invitation.revoked", id, {});
}

export async function previewInvite(
  db: pg.PoolClient,
  tokenHash: string,
): Promise<InvitePreviewDto | null> {
  const r = await db.query(
    `select email,role::text as role,company_name as "companyName" from public.invitation_preview($1)`,
    [tokenHash],
  );
  return r.rows[0] ?? null;
}

export async function acceptInvite(
  db: pg.PoolClient,
  tokenHash: string,
  email: string,
): Promise<string> {
  const r = await db.query(`select public.accept_invitation($1,$2) as company`, [tokenHash, email]);
  return r.rows[0].company;
}

async function audit(
  db: pg.PoolClient,
  companyId: string,
  userId: string,
  action: string,
  id: string,
  details: unknown,
) {
  await db.query(
    `insert into public.audit_log(company_id,actor_user_id,action,entity,entity_id,details) values($1,$2,$3,'invitation',$4,$5)`,
    [companyId, userId, action, id, JSON.stringify(details)],
  );
}
