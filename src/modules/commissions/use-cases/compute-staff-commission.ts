import { computeCommission } from "../domain/compute-commission";
import type { CommissionResult, ServiceOverrideRow } from "../domain/plan";
import { lastDayOfPeriod, nextPeriodStart } from "../domain/period";
import type { CommissionPeriod } from "../domain/period";
import type { CommissionPlanRepository, ResolvedPlan } from "../ports/plan-repository";
import type { ServiceOverrideRepository } from "../ports/override-repository";
import type { CommissionSalesSource } from "../ports/sales-source";
import type { SalarySource } from "../ports/salary-source";

/** المنافذ التي يقرأ منها حساب العمولة: الخطط والمبيعات والرواتب والتجاوزات. */
export interface ComputeStaffCommissionDeps {
  plans: CommissionPlanRepository;
  sales: CommissionSalesSource;
  salary: SalarySource;
  /** تجاوزات الخدمات؛ غيابها يعني حساباً بلا تجاوزات (021 O3). */
  overrides?: ServiceOverrideRepository;
}

/** الشركة والموظفة والشهر المطلوب حساب عمولته. */
export interface ComputeStaffCommissionInput {
  companyId: string;
  staffId: string;
  period: CommissionPeriod;
}

/** إما غياب خطة للفترة مع نتيجة التجاوزات، أو الخطة المحلولة ونتيجة الحساب. */
export type ComputeStaffCommissionResult =
  | { status: "no_plan"; result: CommissionResult }
  | { status: "ok"; plan: ResolvedPlan; result: CommissionResult };

/** هل يطلب حل شرائح الخطة راتب آخر يوم في الفترة؟ */
function needsSalary(plan: ResolvedPlan): boolean {
  const schedule = plan.rules.tierSchedule;
  return schedule?.accumulator === "sales_amount" && schedule.thresholdKind === "salary_multiple";
}

/** يحسب عمولة موظفة لشهر واحد من الخطة والتجاوزات وصافي المبيعات والراتب عند الحاجة. */
export async function computeStaffCommission(
  deps: ComputeStaffCommissionDeps,
  input: ComputeStaffCommissionInput,
): Promise<ComputeStaffCommissionResult> {
  const { companyId, staffId, period } = input;
  const exclusiveEnd = nextPeriodStart(period);
  const plan = await deps.plans.resolve(companyId, staffId, period);
  const [lines, salaryMills, history] = await Promise.all([
    deps.sales.listLines(companyId, staffId, period),
    plan !== null && needsSalary(plan)
      ? deps.salary.salaryOn(companyId, staffId, lastDayOfPeriod(period))
      : Promise.resolve(null),
    deps.overrides
      ? deps.overrides.overrideHistory(companyId, staffId, exclusiveEnd)
      : Promise.resolve([] as ServiceOverrideRow[]),
  ]);
  if (!plan)
    return { status: "no_plan", result: computeCommission(null, lines, salaryMills, history) };
  return {
    status: "ok",
    plan,
    result: computeCommission(plan.rules, lines, salaryMills, history),
  };
}
