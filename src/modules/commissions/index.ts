// Public API of the commissions module. Other modules import only from this file.
export type {
  CommissionErrorCode,
  CommissionResult,
  PlanRules,
  PlanTier,
  PlanValidationError,
  SalesLine,
  TierMode,
  TierThreshold,
} from "./domain/plan";
export type { CommissionPeriod } from "./domain/period";
export type {
  AddCommissionPlanVersionInput,
  AssignCommissionPlanInput,
  CommissionPlanRepository,
  CreateCommissionPlanInput,
  ResolvedPlan,
} from "./ports/plan-repository";
export type { CommissionSalesSource } from "./ports/sales-source";
export type { SalarySource } from "./ports/salary-source";
export { computeStaffCommission } from "./use-cases/compute-staff-commission";
export type {
  ComputeStaffCommissionDeps,
  ComputeStaffCommissionInput,
  ComputeStaffCommissionResult,
} from "./use-cases/compute-staff-commission";
