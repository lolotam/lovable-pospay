import { computeCommission } from "../domain/compute-commission";
import type { CommissionResult } from "../domain/plan";
import { lastDayOfPeriod } from "../domain/period";
import type { CommissionPeriod } from "../domain/period";
import type { CommissionPlanRepository, ResolvedPlan } from "../ports/plan-repository";
import type { CommissionSalesSource } from "../ports/sales-source";
import type { SalarySource } from "../ports/salary-source";

/** المنافذ التي يقرأ منها حساب العمولة: الخطط والمبيعات والرواتب. */
export interface ComputeStaffCommissionDeps {
  plans: CommissionPlanRepository;
  sales: CommissionSalesSource;
  salary: SalarySource;
}

/** الشركة والموظفة والشهر المطلوب حساب عمولته. */
export interface ComputeStaffCommissionInput {
  companyId: string;
  staffId: string;
  period: CommissionPeriod;
}

/** إما غياب خطة للفترة أو الخطة المحلولة ونتيجة الحساب. */
export type ComputeStaffCommissionResult =
  { status: "no_plan" } | { status: "ok"; plan: ResolvedPlan; result: CommissionResult };

/** يحسب عمولة موظف لشهر واحد من الخطة المحلولة وصافي المبيعات والراتب عند الحاجة. */
export async function computeStaffCommission(
  deps: ComputeStaffCommissionDeps,
  input: ComputeStaffCommissionInput,
): Promise<ComputeStaffCommissionResult> {
  const { companyId, staffId, period } = input;
  const plan = await deps.plans.resolve(companyId, staffId, period);
  if (!plan) return { status: "no_plan" };
  const needsSalary = plan.rules.tier?.threshold.kind === "salary_multiple";
  const [lines, salaryMills] = await Promise.all([
    deps.sales.listLines(companyId, staffId, period),
    needsSalary ? deps.salary.salaryOn(companyId, staffId, lastDayOfPeriod(period)) : null,
  ]);
  return { status: "ok", plan, result: computeCommission(plan.rules, lines, salaryMills) };
}
