import {
  computeCommission,
  parseKwdToMills,
  parseMultipleToMilli,
  parsePercentToBp,
  type CommissionResult,
  type PlanRules,
  type SalesLine,
} from "@/modules/commissions";
import { parseSessionCount, type BuilderState } from "./builder-state";

/** عينات الحاسبة التجريبية كما يكتبها المستخدم بنصوص. */
export interface PreviewSample {
  sessionCount: string;
  sessionNetKwd: string;
  salaryKwd: string;
}

/** يبني قواعد المجال بنقاط الأساس والملّيم من حالة البانِي، أو null بلا طرق. */
export function buildDomainRules(state: BuilderState): PlanRules | null {
  const baseRateBp =
    state.baseRateEnabled && state.baseRatePercent.trim() !== ""
      ? parsePercentToBp(state.baseRatePercent)
      : null;
  const baseFixedMills =
    state.baseFixedEnabled && state.baseFixedKwd.trim() !== ""
      ? parseKwdToMills(state.baseFixedKwd)
      : null;
  const tierSchedule = buildDomainSchedule(state);
  if (baseRateBp === null && baseFixedMills === null && tierSchedule === null) return null;
  return { baseRateBp, baseFixedMills, tierSchedule };
}

function buildDomainSchedule(state: BuilderState): PlanRules["tierSchedule"] {
  if (!state.tiersEnabled) return null;
  if (state.accumulator === "sales_amount") {
    return {
      accumulator: "sales_amount",
      mode: state.mode,
      thresholdKind: state.thresholdKind,
      tiers: state.salesTiers
        .filter((row) => row.ratePercent.trim() !== "" && row.threshold.trim() !== "")
        .map((row) => ({
          rateBp: parsePercentToBp(row.ratePercent),
          threshold:
            state.thresholdKind === "fixed"
              ? { kind: "fixed", mills: parseKwdToMills(row.threshold) }
              : { kind: "salary_multiple", multipleMilli: parseMultipleToMilli(row.threshold) },
        })),
    };
  }
  return {
    accumulator: "session_count",
    mode: "excess",
    tiers: state.sessionTiers.map((row) => ({
      afterSessions: parseSessionCount(row.afterSessions),
      reward:
        row.rewardKind === "rate_bp"
          ? { kind: "rate_bp", rateBp: parsePercentToBp(row.rewardValue) }
          : { kind: "fixed_mills", mills: parseKwdToMills(row.rewardValue) },
    })),
  };
}

/** بنود العينة: عدد جلسات بنفس صافي الجلسة، بلا تجاوزات (021 E). */
function sampleLines(sample: PreviewSample): SalesLine[] {
  const count = Number(sample.sessionCount);
  const netMills = sample.sessionNetKwd.trim() === "" ? 0n : parseKwdToMills(sample.sessionNetKwd);
  if (!Number.isInteger(count) || count < 1 || count > 500) return [];
  const occurredAt = new Date();
  return Array.from({ length: count }, (_, index) => ({
    sessionId: `preview-${index + 1}`,
    occurredAt,
    netMills,
  }));
}

function parseSalary(sample: PreviewSample) {
  return sample.salaryKwd.trim() === "" ? null : parseKwdToMills(sample.salaryKwd);
}

/** يحسب المعاينة بالدالة الصافية للمجال؛ أي إدخال غير صالح يعيد null بدل كسر الصفحة. */
export function computePreview(
  state: BuilderState,
  sample: PreviewSample,
): CommissionResult | null {
  try {
    return computeCommission(buildDomainRules(state), sampleLines(sample), parseSalary(sample));
  } catch {
    return null;
  }
}
