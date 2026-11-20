import type pg from "pg";

/**
 * يجمع أسماء أعضاء الشركة عبر دالة أمنية تعيد الاسم فقط (بدون البريد)؛
 * pospay_app بلا منح على جدول المستخدمين، فالأسماء تأتي من هنا لكل الأدوار.
 */
export async function memberNames(
  db: pg.PoolClient,
  companyId: string,
): Promise<Map<string, string>> {
  const { rows } = await db.query<{ user_id: string; name: string }>(
    "select user_id,name from public.company_member_names($1)",
    [companyId],
  );
  return new Map(rows.map((row) => [row.user_id, row.name]));
}
