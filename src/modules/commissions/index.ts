// Public API of the commissions module. Other modules import only from this file.
export type {
  CommissionErrorCode,
  CommissionResult,
  PlanRules,
  PlanValidationError,
  SalesLine,
  SalesTier,
  SalesTierSchedule,
  ServiceOverride,
  ServiceOverrideHistory,
  ServiceOverrideRow,
  SessionCountTier,
  SessionCountTierSchedule,
  TierMode,
  TierSchedule,
  TierThreshold,
} from "./domain/plan";
export type { CommissionPeriod } from "./domain/period";
export type {
  AddCommissionPlanVersionInput,
  AssignCommissionPlanInput,
  CommissionPlanRepository,
  CreateCommissionPlanInput,
  PlanWithVersions,
  ResolvedPlan,
  StaffAssignment,
} from "./ports/plan-repository";
export type {
  SaveServiceOverrideInput,
  ServiceOverrideRepository,
  StoredServiceOverride,
} from "./ports/override-repository";
export type { RecordSalaryInput, SalaryRepository, StoredSalary } from "./ports/salary-repository";
export type { CommissionSalesSource } from "./ports/sales-source";
export type { SalarySource } from "./ports/salary-source";
export type {
  CommissionPlanDto,
  CommissionPlansScreenDto,
  PlanRulesDto,
  PlanVersionDto,
  ServiceOverrideDto,
  ServiceOverridesScreenDto,
  StaffPlanAssignmentDto,
  StaffSalaryDto,
  StaffSalariesScreenDto,
} from "./contracts";
export { CommissionError } from "./domain/plan";
export { computeCommission } from "./domain/compute-commission";
export { computeStaffCommission } from "./use-cases/compute-staff-commission";
export type {
  ComputeStaffCommissionDeps,
  ComputeStaffCommissionInput,
  ComputeStaffCommissionResult,
} from "./use-cases/compute-staff-commission";
export {
  getCommissionPlansFn,
  createPlanWithVersionFn,
  addPlanVersionFn,
  assignPlanFn,
} from "./functions/plans.functions";
export { getServiceOverridesFn, saveServiceOverrideFn } from "./functions/overrides.functions";
export { getStaffSalariesFn, recordSalaryFn } from "./functions/salaries.functions";
