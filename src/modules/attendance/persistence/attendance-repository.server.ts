import type pg from "pg";
import type { AttendanceRepository } from "../ports/attendance-repository";
import { ATTENDANCE_RULES } from "../domain/scan-decision";

export function pgAttendanceRepository(db: pg.PoolClient, userId: string): AttendanceRepository {
  return {
    async branch(branchId) {
      const { rows } = await db.query(
        `select company_id, timezone, latitude, longitude, geofence_meters from public.branches where id = $1`,
        [branchId],
      );
      const r = rows[0];
      if (!r) return null;
      const location = r.latitude != null && r.longitude != null
        ? { latitude: Number(r.latitude), longitude: Number(r.longitude) } : null;
      return { companyId: r.company_id, timeZone: r.timezone, location, geofenceMeters: r.geofence_meters };
    },
    async myStaffId(companyId) {
      const { rows } = await db.query(`select public.my_staff_id($1) as id`, [companyId]);
      return rows[0]?.id ?? null;
    },
    async openRecord(companyId, staffId) {
      const { rows } = await db.query(
        `select r.id, r.check_in_at, s.id as shift_id, s.starts_at, s.ends_at
           from public.attendance_records r
           left join public.shifts s on s.company_id = r.company_id and s.id = r.shift_id
          where r.company_id = $1 and r.staff_id = $2 and r.status = 'open'`,
        [companyId, staffId],
      );
      const r = rows[0];
      if (!r) return null;
      const shift = r.shift_id ? { id: r.shift_id, startsAt: r.starts_at, endsAt: r.ends_at } : null;
      return { id: r.id, checkInAt: r.check_in_at, shift };
    },
    async nextShift(companyId, staffId, around) {
      const { rows } = await db.query(
        `select id, starts_at, ends_at from public.shifts
          where company_id = $1 and staff_id = $2
            and starts_at <= $3::timestamptz + make_interval(secs => $4) and ends_at > $3::timestamptz
          order by starts_at desc limit 1`,
        [companyId, staffId, around, ATTENDANCE_RULES.shiftStartWindowMs / 1000],
      );
      const r = rows[0];
      return r ? { id: r.id, startsAt: r.starts_at, endsAt: r.ends_at } : null;
    },
    async insertCheckIn(companyId, rec) {
      await db.query(
        `insert into public.attendance_records
           (company_id, id, staff_id, branch_id, shift_id, work_date, check_in_at, late_minutes, check_in_exception)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [companyId, rec.id, rec.staffId, rec.branchId, rec.shiftId, rec.workDate, rec.checkInAt, rec.lateMinutes, rec.exception],
      );
    },
    async close(companyId, recordId, at, status, exception) {
      await db.query(
        `update public.attendance_records set check_out_at = $3, status = $4, check_out_exception = $5
          where company_id = $1 and id = $2 and status = 'open'`,
        [companyId, recordId, at, status, exception],
      );
    },
    async markForgotten(companyId, recordId) {
      await db.query(
        `update public.attendance_records set status = 'forgotten' where company_id = $1 and id = $2 and status = 'open'`,
        [companyId, recordId],
      );
    },
    async audit(companyId, action, entityId, details) {
      await db.query(
        `insert into public.audit_log (company_id, actor_user_id, action, entity, entity_id, details)
         values ($1,$2,$3,'attendance_record',$4,$5)`,
        [companyId, userId, action, entityId, JSON.stringify(details)],
      );
    },
  };
}
