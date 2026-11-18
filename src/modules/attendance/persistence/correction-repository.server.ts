import type pg from "pg";
import type { CorrectionRepository, CorrectionRecord } from "../ports/correction-repository";
import type { ForgottenAttendanceDto } from "../correction.contracts";

export function pgCorrectionRepository(db: pg.PoolClient, userId: string): CorrectionRepository {
  return {
    async authorize(companyId) {
      const result = await db.query(
        `select public.is_company_admin($1) and not exists (
        select 1 from public.permission_overrides where company_id=$1 and user_id=$2
        and permission='attendance.correct' and effect='deny') as ok`,
        [companyId, userId],
      );
      if (result.rows[0]?.ok !== true) throw new Error("FORBIDDEN");
    },
    async lock(companyId, recordId) {
      const result = await db.query<CorrectionRecord>(
        `select check_in_at as "checkInAt",
        check_out_at as "checkOutAt", corrected_check_out_at as "correctedAt", status
        from public.attendance_records where company_id=$1 and id=$2 for update`,
        [companyId, recordId],
      );
      return result.rows[0] ?? null;
    },
    async save(companyId, recordId, correctedAt, reason, original) {
      await db.query(
        `update public.attendance_records set corrected_check_out_at=$3,
        correction_reason=$4, corrected_by=$5, previous_check_out_at=check_out_at
        where company_id=$1 and id=$2`,
        [companyId, recordId, correctedAt, reason, userId],
      );
      await db.query(
        `insert into public.audit_log (company_id,actor_user_id,action,entity,entity_id,details)
        values ($1,$2,'attendance.corrected','attendance_record',$3,$4)`,
        [
          companyId,
          userId,
          recordId,
          JSON.stringify({
            previousCheckOutAt: original.checkOutAt,
            previousCorrectedAt: original.correctedAt,
            correctedAt,
            reason,
          }),
        ],
      );
    },
  };
}

export async function listForgottenAttendance(
  db: pg.PoolClient,
  userId: string,
  companyId: string,
): Promise<ForgottenAttendanceDto[]> {
  await pgCorrectionRepository(db, userId).authorize(companyId);
  const result = await db.query(
    `select r.id,s.display_name as "staffName",b.name as "branchName",
    b.timezone as "timeZone",r.work_date::text as "workDate",r.check_in_at,r.check_out_at,
    r.corrected_check_out_at,r.correction_reason,r.corrected_by
    from public.attendance_records r join public.staff_members s on s.company_id=r.company_id and s.id=r.staff_id
    join public.branches b on b.company_id=r.company_id and b.id=r.branch_id
    where r.company_id=$1 and r.status='forgotten' and r.corrected_check_out_at is null
    order by r.check_in_at desc,r.id`,
    [companyId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    staffName: row.staffName,
    branchName: row.branchName,
    timeZone: row.timeZone,
    workDate: row.workDate,
    checkInAt: (row.check_in_at as Date).toISOString(),
    checkOutAt: row.check_out_at ? (row.check_out_at as Date).toISOString() : null,
    correctedAt: row.corrected_check_out_at
      ? (row.corrected_check_out_at as Date).toISOString()
      : null,
    reason: row.correction_reason,
    correctedBy: row.corrected_by,
  }));
}
