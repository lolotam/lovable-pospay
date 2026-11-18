import type pg from "pg";
import type { SessionFormDto } from "../contracts";
import type { SessionRepository } from "../ports/session-repository";

export function pgSessionRepository(
  db: pg.PoolClient,
  userId: string,
  companyId: string,
): SessionRepository {
  return {
    async assignedService(serviceId, staffId) {
      const r = await db.query(
        `select c.name,c.price_mills::text as price,s.branch_id from public.service_assignments a
 join public.service_catalog c on c.company_id=a.company_id and c.id=a.service_id
 join public.staff_members s on s.company_id=a.company_id and s.id=a.staff_id
 where a.company_id=$1 and a.service_id=$2 and a.staff_id=$3 and a.active`,
        [companyId, serviceId, staffId],
      );
      const row = r.rows[0];
      return row
        ? { serviceName: row.name, priceMills: BigInt(row.price), branchId: row.branch_id }
        : null;
    },
    async canWrite(branchId) {
      const r = await db.query(`select public.session_writer($1,$2) as ok`, [companyId, branchId]);
      return Boolean(r.rows[0]?.ok);
    },
    async discountCap() {
      const r = await db.query(`select public.discount_cap($1) as cap`, [companyId]);
      return Number(r.rows[0]?.cap ?? 0);
    },
    async upsertClient(name, phone) {
      const r = await db.query(
        `insert into public.clients(company_id,name,phone) values($1,$2,$3)
 on conflict(company_id,phone) do update set name=excluded.name returning id`,
        [companyId, name, phone],
      );
      return r.rows[0].id;
    },
    async insertSession(s) {
      await db.query(
        `insert into public.service_sessions(company_id,id,service_id,staff_id,branch_id,client_id,occurred_at,service_name,price_mills,recorded_by,list_price_mills,discount_reason)
 values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
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
          s.listPriceMills.toString(),
          s.discountReason,
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

export async function readSessionForm(
  db: pg.PoolClient,
  companyId: string,
): Promise<SessionFormDto> {
  const access = await db.query(`select public.session_writer_any($1) as ok`, [companyId]);
  if (!access.rows[0]?.ok) return { canRecord: false, discountCap: 0, services: [], staff: [] };
  const services = await db.query(
    `select c.id,c.name,c.price_mills::text as "priceMills",
 coalesce((select json_agg(a.staff_id) from public.service_assignments a join public.staff_members s on s.company_id=a.company_id and s.id=a.staff_id
  where a.company_id=c.company_id and a.service_id=c.id and a.active and public.session_writer(s.company_id,s.branch_id)),'[]') as "staffIds"
 from public.service_catalog c where c.company_id=$1 order by c.name`,
    [companyId],
  );
  const staff = await db.query(
    `select id,display_name as name from public.staff_members where company_id=$1 and public.session_writer(company_id,branch_id) order by display_name`,
    [companyId],
  );
  const cap = await db.query(`select public.discount_cap($1) as cap`, [companyId]);
  return {
    canRecord: true,
    discountCap: Number(cap.rows[0]?.cap ?? 0),
    services: services.rows,
    staff: staff.rows,
  };
}
