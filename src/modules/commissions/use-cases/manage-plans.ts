import type { CommissionPlansScreenDto, PlanRulesDto, PlanRulesInput } from "../contracts";
import { parseKwdToMills, parseMultipleToMilli, parsePercentToBp } from "../domain/parse";
import { CommissionError, isValidPlanName, validatePlanVersion } from "../domain/plan";
import type { PlanRules } from "../domain/plan";
import type { CommissionPeriod } from "../domain/period";
import type { CommissionPlanRepository, CreateCommissionPlanInput } from "../ports/plan-repository";

/** يحول قواعد المجال إلى شكل عرض بنصوص ملّيم بلا أي number للنقود. */
export function toPlanRulesDto(rules: PlanRules): PlanRulesDto {
  const schedule = rules.tierSchedule;
  return {
    baseRateBp: rules.baseRateBp?.toString() ?? null,
    baseFixedMills: rules.baseFixedMills?.toString() ?? null,
    tierSchedule:
      schedule === null
        ? null
        : schedule.accumulator === "sales_amount"
          ? {
              accumulator: "sales_amount",
              mode: schedule.mode,
              thresholdKind: schedule.thresholdKind,
              tiers: schedule.tiers.map((tier) => ({
                rateBp: tier.rateBp.toString(),
                threshold:
                  tier.threshold.kind === "fixed"
                    ? { kind: "fixed", mills: tier.threshold.mills.toString() }
                    : {
                        kind: "salary_multiple",
                        multipleMilli: tier.threshold.multipleMilli.toString(),
                      },
              })),
            }
          : {
              accumulator: "session_count",
              mode: "excess",
              tiers: schedule.tiers.map((tier) => ({
                afterSessions: tier.afterSessions,
                reward:
                  tier.reward.kind === "rate_bp"
                    ? { kind: "rate_bp", rateBp: tier.reward.rateBp.toString() }
                    : { kind: "fixed_mills", mills: tier.reward.mills.toString() },
              })),
            },
  };
}

/** يحول قواعد البانِي النصية إلى قواعد المجال بلا أي رقم عائم (021 Contract). */
export function toPlanRules(rules: PlanRulesInput): PlanRules {
  const schedule = rules.tierSchedule;
  return {
    baseRateBp:
      rules.baseRatePercent !== undefined ? parsePercentToBp(rules.baseRatePercent) : null,
    baseFixedMills: rules.baseFixedKwd !== undefined ? parseKwdToMills(rules.baseFixedKwd) : null,
    tierSchedule:
      schedule === undefined
        ? null
        : schedule.accumulator === "sales_amount"
          ? {
              accumulator: "sales_amount",
              mode: schedule.mode,
              thresholdKind: schedule.thresholdKind,
              tiers: schedule.tiers.map((tier) => ({
                rateBp: parsePercentToBp(tier.ratePercent),
                threshold:
                  tier.threshold.kind === "fixed"
                    ? { kind: "fixed", mills: parseKwdToMills(tier.threshold.kwd) }
                    : {
                        kind: "salary_multiple",
                        multipleMilli: parseMultipleToMilli(tier.threshold.multiple),
                      },
              })),
            }
          : {
              accumulator: "session_count",
              mode: "excess",
              tiers: schedule.tiers.map((tier) => ({
                afterSessions: tier.afterSessions,
                reward:
                  tier.reward.kind === "rate_bp"
                    ? { kind: "rate_bp", rateBp: parsePercentToBp(tier.reward.ratePercent) }
                    : { kind: "fixed_mills", mills: parseKwdToMills(tier.reward.kwd) },
              })),
            },
  };
}

/** يتحقق من القواعد المحولة قبل أي كتابة. */
function assertValidRules(rules: PlanRules): void {
  const validation = validatePlanVersion(rules);
  if (validation) throw new CommissionError(validation);
}

/**
 * ينشئ خطة بإصدارها الأول في معاملة واحدة: تحقق الاسم والقواعد ثم
 * الإنشاء والإضافة المتسلسلة وAudit داخل مخزن المعاملة نفسها (021 M8).
 */
export async function createPlanWithVersion(
  repository: CommissionPlanRepository,
  input: CreateCommissionPlanInput & { effectiveMonth: string; rules: PlanRulesInput },
): Promise<{ id: string; versionId: string; version: number }> {
  if (!isValidPlanName(input.name)) throw new CommissionError("PLAN_INVALID");
  const rules = toPlanRules(input.rules);
  assertValidRules(rules);
  const plan = await repository.createPlan({ name: input.name });
  const version = await repository.addVersion({
    planId: plan.id,
    effectiveMonth: input.effectiveMonth,
    rules,
  });
  return { id: plan.id, versionId: version.id, version: version.version };
}

/** يضيف إصداراً مصححاً لخطة قائمة بعد التحقق من القواعد (021 M8). */
export async function addPlanVersion(
  repository: CommissionPlanRepository,
  input: { planId: string; effectiveMonth: string; rules: PlanRulesInput },
): Promise<{ id: string; version: number }> {
  const rules = toPlanRules(input.rules);
  assertValidRules(rules);
  return repository.addVersion({
    planId: input.planId,
    effectiveMonth: input.effectiveMonth,
    rules,
  });
}

/** يسند خطة لموظفة بدءاً من أول شهر محدد (021 Q6، M8). */
export async function assignPlan(
  repository: CommissionPlanRepository,
  input: { staffId: string; planId: string; effectiveMonth: string },
): Promise<{ id: string }> {
  return repository.assign(input);
}

/** يجهز شاشة الخطط: الخطط بإصداراتها وإسنادات الموظفات أو «بدون خطة» (021 Q8). */
export async function loadPlansScreen(
  repository: CommissionPlanRepository,
  period: CommissionPeriod,
): Promise<CommissionPlansScreenDto> {
  const [plans, assignments] = await Promise.all([
    repository.listPlansWithLatestVersions(),
    repository.listStaffAssignments(period),
  ]);
  return {
    plans: plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      versions: plan.versions.map((version) => ({
        id: version.id,
        version: version.version,
        effectiveMonth: version.effectiveMonth,
        rules: toPlanRulesDto(version.rules),
      })),
    })),
    staff: assignments.map((assignment) => ({
      staffId: assignment.staffId,
      staffName: assignment.staffName,
      branchId: assignment.branchId,
      planId: assignment.planId,
      planName: assignment.planName,
      effectiveMonth: assignment.effectiveMonth,
    })),
  };
}
