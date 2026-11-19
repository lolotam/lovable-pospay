import type { SalesLine } from "../domain/plan";
import type { CommissionPeriod } from "../domain/period";

/** مصدر صافي مبيعات الجلسات الذي يفصل تواريخ الفروع والخصومات عن محرك العمولة. */
export interface CommissionSalesSource {
  /** يعيد صافي بنود موظف واحد داخل الفترة بعد الخصم ومن دون البقشيش. */
  listLines(companyId: string, staffId: string, period: CommissionPeriod): Promise<SalesLine[]>;
}
