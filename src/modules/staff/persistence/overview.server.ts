import type pg from "pg";
/** عدد الموظفات في الشركة أو الفرع المصرح به. */
export async function readStaffCount(
  db: pg.PoolClient,
  companyId: string,
  branchId: string | null,
): Promise<string> {
  const { rows } = await db.query<{ count: string }>(
    "select count(*)::text as count from public.staff_members where company_id=$1 and ($2::uuid is null or branch_id=$2)",
    [companyId, branchId],
  );
  return rows[0]?.count ?? "0";
}
/** حالة ربط هاتف الموظفة الحالية فقط. */
export async function readOwnPhoneState(
  db: pg.PoolClient,
  companyId: string,
  userId: string,
): Promise<boolean> {
  const { rows } = await db.query<{ bound: boolean }>(
    "select exists(select 1 from public.phone_bindings where company_id=$1 and user_id=$2) as bound",
    [companyId, userId],
  );
  return rows[0]?.bound === true;
}
