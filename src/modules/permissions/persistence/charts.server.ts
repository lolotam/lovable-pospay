import type pg from "pg";
import { companyChartsSchema, attendanceDaySchema, growthSchema } from "../contracts";
import type { ChartReader } from "../ports/chart-reader";
import { padAttendance } from "../domain/chart-range";
export function pgChartReader(db: pg.PoolClient, userId: string): ChartReader {
  return {
    async company(company, branch, range, recording) {
      const dates = await db.query(
        "select (current_timestamp at time zone coalesce((select timezone from public.branches where company_id=$1 and ($2::uuid is null or id=$2) order by id limit 1),'UTC'))::date::text as today",
        [company, branch],
      );
      const today: string = dates.rows[0].today;
      const args = [company, branch, today, range];
      const attendance = await db.query(
        "select day::text, on_time,late,forgotten,avg_late from public.attendance_daily($1,$2,$3::date-($4::int-1),$3::date)",
        args,
      );
      if (!attendance.rows.length) throw new Error("FORBIDDEN");
      const leaders = await db.query(
        "select * from public.late_leaders($1,$2,$3::date-($4::int-1),$3::date)",
        args,
      );
      const sessions = recording
        ? await db.query(
            "select day::text,sessions,revenue_mills::text from public.session_daily($1,$2,$3::date-($4::int-1),$3::date)",
            args,
          )
        : null;
      return companyChartsSchema.parse({
        attendance: attendance.rows.map(mapDay),
        lateLeaders: leaders.rows.map((r) => ({
          staffId: r.staff_id,
          name: r.name,
          lateMinutes: Number(r.late_minutes),
        })),
        sessions:
          sessions?.rows.map((r) => ({
            day: r.day,
            sessions: r.sessions,
            revenueMills: r.revenue_mills,
          })) ?? null,
      });
    },
    async own(company) {
      const result = await db.query(
        `select a.work_date::text as day,count(*) filter(where a.status<>'forgotten' and a.late_minutes=0)::int as on_time,count(*) filter(where a.status<>'forgotten' and a.late_minutes>0)::int as late,count(*) filter(where a.status='forgotten')::int as forgotten,avg(a.late_minutes) filter(where a.late_minutes>0) as avg_late
        from public.attendance_records a join public.staff_members s on s.company_id=a.company_id and s.id=a.staff_id join public.branches b on b.company_id=s.company_id and b.id=s.branch_id
        where a.company_id=$1 and s.user_id=$2 and a.work_date between (current_timestamp at time zone b.timezone)::date-29 and (current_timestamp at time zone b.timezone)::date group by a.work_date order by a.work_date`,
        [company, userId],
      );
      const date = await db.query(
        "select (current_timestamp at time zone coalesce((select b.timezone from public.staff_members s join public.branches b on b.company_id=s.company_id and b.id=s.branch_id where s.company_id=$1 and s.user_id=$2 order by s.id limit 1),'UTC'))::date::text as today",
        [company, userId],
      );
      return padAttendance(30, date.rows[0].today, result.rows.map(mapDay));
    },
    async platform() {
      const result = await db.query(
        "select week::text,companies,users from public.platform_growth(12)",
      );
      if (!result.rows.length) throw new Error("FORBIDDEN");
      return growthSchema.parse(
        result.rows.map((r) => ({
          week: r.week,
          companies: Number(r.companies),
          users: Number(r.users),
        })),
      );
    },
  };
}
function mapDay(r: {
  day: string;
  on_time: number;
  late: number;
  forgotten: number;
  avg_late: string | null;
}) {
  return attendanceDaySchema.parse({
    day: r.day,
    onTime: r.on_time,
    late: r.late,
    forgotten: r.forgotten,
    avgLate: r.avg_late === null ? null : Number(r.avg_late),
  });
}
