import type pg from "pg";
import type { SalesLine } from "../domain/plan";
import type { CommissionPeriod } from "../domain/period";
import { periodStart } from "../domain/period";
import type { CommissionSalesSource } from "../ports/sales-source";

/**
 * مصدر مبيعات الجلسات الحقيقي فوق service_sessions: يقرأ الصافي بعد الخصم
 * بلا بقشيش لشهر تقويمي محلي بحسب توقيت الفرع (D-10) بترتيب D-50 الثابت
 * (occurred_at ثم recorded_at ثم id)، عبر withUser وبسياسة sessions_report
 * فلا يرى مدير الفرع إلا جلسات فرعه (021 D1..D3).
 */
export function pgCommissionSalesSource(db: pg.PoolClient): CommissionSalesSource {
  return {
    async listLines(companyId, staffId, period: CommissionPeriod): Promise<SalesLine[]> {
      const { rows } = await db.query<{
        sessionId: string;
        serviceId: string;
        occurredAt: Date;
        netMills: string;
      }>(
        `select s.id as "sessionId",s.service_id as "serviceId",s.occurred_at as "occurredAt",
                s.price_mills::text as "netMills"
         from public.service_sessions s
         join public.branches b on b.company_id=s.company_id and b.id=s.branch_id
         where s.company_id=$1 and s.staff_id=$2
           and (s.occurred_at at time zone b.timezone) >= $3::timestamp
           and (s.occurred_at at time zone b.timezone) < ($3::timestamp + interval '1 month')
         order by s.occurred_at,s.recorded_at,s.id`,
        [companyId, staffId, periodStart(period)],
      );
      return rows.map((row) => ({
        sessionId: row.sessionId,
        serviceId: row.serviceId,
        occurredAt: row.occurredAt,
        netMills: BigInt(row.netMills),
      }));
    },
  };
}
