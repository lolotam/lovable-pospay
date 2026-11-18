import type pg from "pg";
import type { AttendanceReportRow } from "../report.contracts";
export async function readAttendanceReport(
  db: pg.PoolClient,
  companyId: string,
  from: string,
  until: string,
): Promise<AttendanceReportRow[]> {
  const access = await db.query(`select public.report_reader($1) as allowed`, [companyId]);
  if (!access.rows[0]?.allowed) throw new Error("FORBIDDEN");
  const rows = await db.query(
    `select r.id,s.display_name as name,b.name as branch,b.timezone as "timeZone",r.work_date::text as "workDate",r.check_in_at as "checkIn",r.check_out_at as "checkOut",r.corrected_check_out_at as corrected,r.correction_reason as reason,r.late_minutes as late,r.status::text from public.attendance_records r join public.staff_members s on s.company_id=r.company_id and s.id=r.staff_id join public.branches b on b.company_id=r.company_id and b.id=r.branch_id where r.company_id=$1 and r.check_in_at>=$2 and r.check_in_at<$3 and public.report_reader(r.company_id,r.branch_id) order by r.check_in_at desc`,
    [companyId, from, until],
  );
  return rows.rows.map((r) => ({
    ...r,
    checkIn: r.checkIn.toISOString(),
    checkOut: r.checkOut?.toISOString() ?? null,
    corrected: r.corrected?.toISOString() ?? null,
  }));
}
