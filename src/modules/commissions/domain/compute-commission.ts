import type { Mills } from "@/shared/kernel/money";
import { CommissionError, resolveOverride } from "./plan";
import type {
  CommissionResult,
  PlanRules,
  SalesLine,
  SalesTierSchedule,
  ServiceOverrideHistory,
  SessionCountTierSchedule,
  TierThreshold,
} from "./plan";

/**
 * يقرّب بسط مكوّن عمولة نزولاً إلى ملّيم صحيح مرة واحدة لكل فترة (021 M1).
 *
 * @param numerator حاصل ضرب المبلغ في نسبة بنقاط الأساس
 * @returns قيمة المكوّن بالملّيم بعد حذف الكسر
 */
function roundCommission(numerator: bigint): Mills {
  return numerator / 10000n;
}

function resolveThreshold(threshold: TierThreshold, salaryMills: Mills | null): Mills {
  if (threshold.kind === "fixed") return threshold.mills;
  if (salaryMills === null) throw new CommissionError("SALARY_REQUIRED");
  return (salaryMills * threshold.multipleMilli) / 1000n;
}

/** حساب بسط شرائح المبيعات المتدرجة على الزيادة أو الرجوعية (021 M4). */
function salesScheduleNumerator(
  schedule: SalesTierSchedule,
  sales: Mills,
  salary: Mills | null,
): bigint {
  if (schedule.mode === "all_after") {
    let applied: bigint | null = null;
    for (const tier of schedule.tiers) {
      const threshold = resolveThreshold(tier.threshold, salary);
      if (sales >= threshold) applied = sales * tier.rateBp;
    }
    return applied ?? 0n;
  }
  let numerator = 0n;
  for (let index = 0; index < schedule.tiers.length; index++) {
    const tier = schedule.tiers[index]!;
    const lower = resolveThreshold(tier.threshold, salary);
    const upper =
      index + 1 < schedule.tiers.length
        ? resolveThreshold(schedule.tiers[index + 1]!.threshold, salary)
        : null;
    const bounded = upper === null ? sales : sales < upper ? sales : upper;
    const excess = bounded > lower ? bounded - lower : 0n;
    numerator += excess * tier.rateBp;
  }
  return numerator;
}

/** حساب شرائح عدد الجلسات بنسبة أو مبلغ ثابت (021 M5). */
function sessionCountComponent(schedule: SessionCountTierSchedule, lines: SalesLine[]): bigint {
  let rateNumerator = 0n;
  let fixedMills = 0n;
  for (let index = 0; index < lines.length; index++) {
    const oneBased = index + 1;
    let tier = schedule.tiers[schedule.tiers.length - 1]!;
    for (const candidate of schedule.tiers) {
      if (oneBased > candidate.afterSessions) tier = candidate;
    }
    if (oneBased <= tier.afterSessions) continue;
    if (tier.reward.kind === "rate_bp")
      rateNumerator += lines[index]!.netMills * tier.reward.rateBp;
    else fixedMills += tier.reward.mills;
  }
  return roundCommission(rateNumerator) + fixedMills;
}

/**
 * يحسب عمولة موظفة عن شهر من صافي الجلسات مع التجاوزات: يفصل بنود
 * التجاوز عن البنود المؤهلة، ثم يجمع القاعدة النسبية والثابتة والشرائح،
 * ويقرّب كل مكوّن نزولاً مرة واحدة لكل فترة (021 M0c، M1..M6).
 *
 * @param rules قواعد الخطة السارية، أو null لموظفة بلا خطة (تجاوزات فقط)
 * @param lines بنود الجلسات بترتيب D-50 (وقت التنفيذ تصاعدياً)
 * @param salaryMills راتب آخر يوم في الفترة عند وجود حد مرتبط بالراتب
 * @param overrides تاريخ تجاوزات الخدمات لحسم كل بند عند وقته
 * @returns مكونات العمولة كاملة بالملّيم
 */
export function computeCommission(
  rules: PlanRules | null,
  lines: SalesLine[],
  salaryMills: Mills | null,
  overrides: ServiceOverrideHistory = [],
): CommissionResult {
  if (lines.some((line) => line.netMills < 0n)) throw new CommissionError("INVALID_LINE");
  const overrideRateNumerator: bigint[] = [];
  let overrideFixedMills = 0n;
  let overrideSalesMills = 0n;
  let overrideSessionCount = 0;
  const qualifying: SalesLine[] = [];
  for (const line of lines) {
    const applied =
      line.serviceId === undefined
        ? null
        : resolveOverride(overrides, line.serviceId, line.occurredAt);
    if (applied === null) {
      qualifying.push(line);
      continue;
    }
    overrideSessionCount++;
    overrideSalesMills += line.netMills;
    if (applied.kind === "rate_bp") overrideRateNumerator.push(line.netMills * applied.rateBp);
    else overrideFixedMills += applied.mills;
  }
  const qualifyingSalesMills = qualifying.reduce((sum, line) => sum + line.netMills, 0n);
  const overrideNumerator = overrideRateNumerator.reduce((sum, part) => sum + part, 0n);
  const overrideMills = roundCommission(overrideNumerator) + overrideFixedMills;
  const baseRateMills =
    rules !== null && rules.baseRateBp !== null
      ? roundCommission(qualifyingSalesMills * rules.baseRateBp)
      : 0n;
  const baseFixedMills =
    rules !== null && rules.baseFixedMills !== null
      ? BigInt(qualifying.length) * rules.baseFixedMills
      : 0n;
  const schedule = rules?.tierSchedule ?? null;
  const thresholdMills =
    schedule && schedule.accumulator === "sales_amount"
      ? resolveThreshold(schedule.tiers[0]!.threshold, salaryMills)
      : null;
  let tierMills = 0n;
  if (schedule?.accumulator === "sales_amount") {
    tierMills = roundCommission(
      salesScheduleNumerator(schedule, qualifyingSalesMills, salaryMills),
    );
  } else if (schedule?.accumulator === "session_count") {
    tierMills = sessionCountComponent(schedule, qualifying);
  }
  const baseMills = baseRateMills + baseFixedMills;
  return {
    qualifyingSalesMills,
    qualifyingSessionCount: qualifying.length,
    thresholdMills,
    baseRateMills,
    baseFixedMills,
    baseMills,
    tierMills,
    overrideMills,
    overrideSalesMills,
    overrideSessionCount,
    totalMills: baseMills + tierMills + overrideMills,
  };
}
