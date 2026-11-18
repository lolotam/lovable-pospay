import type pg from "pg";
import type { SessionFormRecord, SessionRepository } from "../ports/session-repository";

export function pgSessionRepository(
  db: pg.PoolClient,
  userId: string,
  companyId: string,
): SessionRepository {
  return {
    async assignedService(serviceId, staffId) {
      const r = await db.query(
        `select c.name,c.price_mills::text as price,s.branch_id,b.timezone from public.service_assignments a
 join public.service_catalog c on c.company_id=a.company_id and c.id=a.service_id
 join public.staff_members s on s.company_id=a.company_id and s.id=a.staff_id
 join public.branches b on b.company_id=s.company_id and b.id=s.branch_id
 where a.company_id=$1 and a.service_id=$2 and a.staff_id=$3 and a.active`,
        [companyId, serviceId, staffId],
      );
      const row = r.rows[0];
      return row
        ? {
            serviceName: row.name,
            priceMills: BigInt(row.price),
            branchId: row.branch_id,
            timeZone: row.timezone,
          }
        : null;
    },
    async canWrite(branchId) {
      const r = await db.query(`select public.session_writer($1,$2) as ok`, [companyId, branchId]);
      return Boolean(r.rows[0]?.ok);
    },
    async resolveTime(local, timeZone) {
      const r = await db.query<{ occurred_at: Date; round_trip: string }>(
        `select $1::timestamp at time zone $2 as occurred_at,
          to_char(($1::timestamp at time zone $2) at time zone $2, 'YYYY-MM-DD"T"HH24:MI') as round_trip`,
        [local, timeZone],
      );
      const row = r.rows[0];
      if (!row || row.round_trip !== local) throw new Error("INVALID_SESSION_TIME");
      return row.occurred_at;
    },
    async lockRecordedSession(id) {
      await db.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `service-session:${companyId.toLowerCase()}:${id.toLowerCase()}`,
      ]);
      const { rows } = await db.query<{ owned: boolean }>(
        "select public.owns_recorded_session($1,$2) as owned",
        [companyId, id],
      );
      return rows[0]?.owned === true;
    },
    async upsertClient(branchId, name, phone) {
      const r = await db.query("select public.upsert_session_client($1,$2,$3,$4) as id", [
        companyId,
        branchId,
        name,
        phone,
      ]);
      return r.rows[0].id;
    },
    async insertSession(s) {
      await db.query(
        `insert into public.service_sessions(company_id,id,service_id,staff_id,branch_id,client_id,occurred_at,service_name,price_mills,recorded_by)
 values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          companyId,
          s.id,
          s.serviceId,
          s.staffId,
          s.branchId,
          s.clientId,
          s.occurredAt,
          s.serviceName,
          s.priceMills.toString(),
          userId,
        ],
      );
    },
    async audit(id, details) {
      await db.query(
        `insert into public.audit_log(company_id,actor_user_id,action,entity,entity_id,details) values($1,$2,'session.recorded','service_session',$3,$4)`,
        [companyId, userId, id, JSON.stringify(details)],
      );
    },
  };
}

/** يقرأ خيارات تسجيل الجلسة المصرح بها للمستخدم. */
export async function readSessionForm(
  db: pg.PoolClient,
  companyId: string,
): Promise<SessionFormRecord> {
  const access = await db.query(`select public.session_writer_any($1) as ok`, [companyId]);
  if (!access.rows[0]?.ok) return { canRecord: false, services: [], staff: [] };
  const services = await db.query<
    Omit<SessionFormRecord["services"][number], "priceMills"> & { priceMills: string }
  >(
    `select c.id,c.name,c.price_mills::text as "priceMills",
 coalesce((select json_agg(a.staff_id) from public.service_assignments a join public.staff_members s on s.company_id=a.company_id and s.id=a.staff_id
  where a.company_id=c.company_id and a.service_id=c.id and a.active and public.session_writer(s.company_id,s.branch_id)),'[]') as "staffIds"
 from public.service_catalog c where c.company_id=$1 order by c.name`,
    [companyId],
  );
  const staff = await db.query<SessionFormRecord["staff"][number]>(
    `select s.id,s.display_name as name,b.timezone as "timeZone" from public.staff_members s
      join public.branches b on b.company_id=s.company_id and b.id=s.branch_id
      where s.company_id=$1 and public.session_writer(s.company_id,s.branch_id) order by s.display_name`,
    [companyId],
  );
  return {
    canRecord: true,
    services: services.rows.map((service) => ({
      ...service,
      priceMills: BigInt(service.priceMills),
    })),
    staff: staff.rows,
  };
}
