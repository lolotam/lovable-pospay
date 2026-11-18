import type pg from "pg";

/**
 * فرع يحق للمستخدم عرض QR له: صلاحية pos.access في الشركة، والمالك يرى كل الفروع،
 * وأي عضوية أخرى ترى فرعها فقط أو كل الفروع لو العضوية بلا فرع (R5).
 */
const QR_BRANCH_ACCESS = `public.has_permission(b.company_id, 'pos.access') and (
  public.has_company_role(b.company_id, 'owner') or exists (
    select 1 from public.memberships m
     where m.company_id = b.company_id and m.user_id = public.current_app_user()
       and (m.branch_id is null or m.branch_id = b.id)))`;

export async function listQrBranches(db: pg.PoolClient, companyId: string) {
  const { rows } = await db.query<{ id: string; name: string }>(
    `select b.id, b.name from public.branches b
      where b.company_id = $1 and ${QR_BRANCH_ACCESS}
      order by b.name`,
    [companyId],
  );
  return rows;
}

export async function qrBranchName(db: pg.PoolClient, branchId: string): Promise<string | null> {
  const { rows } = await db.query<{ name: string }>(
    `select b.name from public.branches b where b.id = $1 and ${QR_BRANCH_ACCESS}`,
    [branchId],
  );
  return rows[0]?.name ?? null;
}
