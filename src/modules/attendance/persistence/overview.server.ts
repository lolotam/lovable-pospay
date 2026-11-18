import type pg from "pg";
/** يقرأ عدد الحاضرين اليوم والاستثناءات المفتوحة ضمن الفرع المصرح به. */
export async function readAttendanceOverview(
  db: pg.PoolClient,
  companyId: string,
  branchId: string | null,
) {
  const { rows } = await db.query<{ present: string; exceptions: string }>(
    `select count(distinct r.staff_id) filter(where r.work_date=(current_timestamp at time zone b.timezone)::date and r.check_out_at is null and r.corrected_check_out_at is null and r.status='open')::text as present,count(*) filter(where r.status='forgotten' and r.corrected_check_out_at is null)::text as exceptions from public.attendance_records r join public.branches b on b.company_id=r.company_id and b.id=r.branch_id where r.company_id=$1 and ($2::uuid is null or r.branch_id=$2)`,
    [companyId, branchId],
  );
  return rows[0] ?? { present: "0", exceptions: "0" };
}
/** حالة حضور الموظفة اليوم دون كشف بيانات غيرها. */
export async function readOwnAttendanceOverview(
  db: pg.PoolClient,
  companyId: string,
  userId: string,
) {
  const { rows } = await db.query<{ status: string }>(
    `select r.status::text from public.attendance_records r join public.staff_members s on s.company_id=r.company_id and s.id=r.staff_id join public.branches b on b.company_id=r.company_id and b.id=r.branch_id where r.company_id=$1 and s.user_id=$2 and r.work_date=(current_timestamp at time zone b.timezone)::date order by r.check_in_at desc limit 1`,
    [companyId, userId],
  );
  return rows[0]?.status ?? null;
}
