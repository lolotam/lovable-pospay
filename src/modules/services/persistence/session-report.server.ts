import type pg from "pg";
import type { SessionReportRow } from "../contracts";
export async function readSessionReport(
  db: pg.PoolClient,
  companyId: string,
  from: string,
  until: string,
): Promise<SessionReportRow[]> {
  const rows = await db.query(
    `select r.id,s.display_name as name,r.service_name as service,r.occurred_at as "occurredAt",r.price_mills::text as "priceMills" from public.service_sessions r join public.staff_members s on s.company_id=r.company_id and s.id=r.staff_id where r.company_id=$1 and r.occurred_at>=$2 and r.occurred_at<$3 order by r.occurred_at desc`,
    [companyId, from, until],
  );
  return rows.rows.map((r) => ({ ...r, occurredAt: r.occurredAt.toISOString() }));
}
