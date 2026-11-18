import type pg from "pg";
import type { SessionReportRecord } from "../ports/session-repository";
/** يقرأ سجلات الجلسات المصرح بها مع توقيت الفرع والسعر بالفلس. */
export async function readSessionReport(
  db: pg.PoolClient,
  companyId: string,
  from: string,
  until: string,
  limit: number,
): Promise<SessionReportRecord[]> {
  const access = await db.query("select public.report_reader($1) as allowed", [companyId]);
  if (!access.rows[0]?.allowed) throw new Error("FORBIDDEN");
  const rows = await db.query<Omit<SessionReportRecord, "priceMills"> & { priceMills: string }>(
    `select r.id,s.display_name as name,r.service_name as service,r.occurred_at as "occurredAt",r.recorded_at as "recordedAt",r.price_mills::text as "priceMills",c.name as "clientName",b.timezone as "timeZone"
 from public.service_sessions r join public.staff_members s on s.company_id=r.company_id and s.id=r.staff_id
 join public.branches b on b.company_id=r.company_id and b.id=r.branch_id
 left join public.clients c on c.company_id=r.company_id and c.id=r.client_id
 where r.company_id=$1 and r.occurred_at>=$2 and r.occurred_at<$3 and public.report_reader(r.company_id,r.branch_id) order by r.occurred_at desc,r.id desc limit $4`,
    [companyId, from, until, limit],
  );
  return rows.rows.map((row) => ({ ...row, priceMills: BigInt(row.priceMills) }));
}
