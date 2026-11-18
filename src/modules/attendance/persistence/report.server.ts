import type pg from "pg";
import type { AttendanceReportRecord } from "../ports/report-repository";
/** يقرأ سجلات الحضور المصرح بها ضمن نطاق التقرير. */
export async function readAttendanceReport(
  db: pg.PoolClient,
  companyId: string,
  from: string,
  until: string,
  limit: number,
  correctedOnly = false,
): Promise<AttendanceReportRecord[]> {
  const access = await db.query(`select public.report_reader($1) as allowed`, [companyId]);
  if (!access.rows[0]?.allowed) throw new Error("FORBIDDEN");
  const rows = await db.query<AttendanceReportRecord>(
    `select r.id,s.display_name as name,b.name as branch,b.timezone as "timeZone",r.work_date::text as "workDate",r.check_in_at as "checkIn",r.check_out_at as "checkOut",r.corrected_check_out_at as corrected,r.correction_reason as reason,r.late_minutes as late,r.status::text from public.attendance_records r join public.staff_members s on s.company_id=r.company_id and s.id=r.staff_id join public.branches b on b.company_id=r.company_id and b.id=r.branch_id where r.company_id=$1 and r.check_in_at>=$2 and r.check_in_at<$3 and public.report_reader(r.company_id,r.branch_id) and (not $5::boolean or r.corrected_check_out_at is not null) order by r.check_in_at desc,r.id desc limit $4`,
    [companyId, from, until, limit, correctedOnly],
  );
  return rows.rows;
}
