import type { Mills } from "@/shared/kernel/money";

/** مصدر الرواتب التاريخية المطلوب لحساب الحدود المرتبطة بالراتب. */
export interface SalarySource {
  /** يعيد راتب الموظف في التاريخ المحدد بالملّيم، أو null عند عدم وجود راتب مسجل. */
  salaryOn(companyId: string, staffId: string, date: string): Promise<Mills | null>;
}
