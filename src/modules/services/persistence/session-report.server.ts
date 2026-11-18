import type pg from "pg";
import type { SessionReportRow } from "../contracts";
import { maskPhone, isLateSession } from "../domain/client-phone";
export async function readSessionReport(
  db: pg.PoolClient,
  companyId: string,
  from: string,
  until: string,
): Promise<SessionReportRow[]> {
  const rows = await db.query(
    `select r.id,s.display_name as name,r.service_name as service,r.occurred_at,r.recorded_at,r.price_mills::text as "priceMills",c.name as "clientName",c.phone,b.timezone
 from public.service_sessions r join public.staff_members s on s.company_id=r.company_id and s.id=r.staff_id
 join public.branches b on b.company_id=r.company_id and b.id=r.branch_id
 left join public.clients c on c.company_id=r.company_id and c.id=r.client_id
 where r.company_id=$1 and r.occurred_at>=$2 and r.occurred_at<$3 and public.report_reader(r.company_id,r.branch_id) order by r.occurred_at desc`,
    [companyId, from, until],
  );
  return rows.rows.map((r) => ({
    id: r.id,
    name: r.name,
    service: r.service,
    priceMills: r.priceMills,
    occurredAt: r.occurred_at.toISOString(),
    clientName: r.clientName ?? null,
    clientPhone: r.phone ? maskPhone(r.phone) : null,
    late: isLateSession(r.occurred_at, r.recorded_at, r.timezone),
  }));
}
