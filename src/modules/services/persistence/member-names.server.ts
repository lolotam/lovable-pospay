import type pg from "pg";

/**
 * يجمع أسماء أعضاء الشركة من المصدرين المصرح بهما فقط: دليل الأعضاء
 * للأOwner، وبديل أسماء الموظفات المرئية عبر RLS لبقية الأعضاء؛ لا يقرأ
 * جدول المستخدمين مباشرة لأن pospay_app بلا منح عليه.
 */
export async function memberNames(
  db: pg.PoolClient,
  companyId: string,
): Promise<Map<string, string>> {
  const directory = await db.query<{ user_id: string; name: string }>(
    "select user_id,name from public.company_member_directory($1)",
    [companyId],
  );
  if (directory.rows.length > 0) {
    return new Map(directory.rows.map((row) => [row.user_id, row.name]));
  }
  const staff = await db.query<{ user_id: string; display_name: string }>(
    `select user_id,display_name from public.staff_members
     where company_id=$1 and user_id is not null`,
    [companyId],
  );
  return new Map(staff.rows.map((row) => [row.user_id, row.display_name]));
}
