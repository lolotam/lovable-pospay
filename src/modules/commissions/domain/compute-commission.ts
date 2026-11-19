import type { Mills } from "@/shared/kernel/money";
import { CommissionError } from "./plan";
import type { CommissionResult, PlanRules, PlanTier, SalesLine, TierThreshold } from "./plan";

/**
 * يقرّب بسط مكوّن العمولة نزولاً إلى ملّيم صحيح مرة واحدة لكل فترة.
 * TODO(spec) Q1: تقريب كل مكوّن نزولاً مؤقت حتى اعتماد قاعدة التقريب النهائية.
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

function tierNumerator(tier: PlanTier, sales: Mills, threshold: Mills): bigint {
  if (tier.mode === "all_after") return sales >= threshold ? sales * tier.rateBp : 0n;
  const excess = sales > threshold ? sales - threshold : 0n;
  return excess * tier.rateBp;
}

/**
 * يحسب عمولة موظف عن شهر من صافي الجلسات، ويجمع القاعدة والشريحة بعد تقريب كل منهما.
 *
 * @param rules قواعد إصدار الخطة الساري للفترة
 * @param lines صافي الجلسات بعد الخصم ومن دون البقشيش
 * @param salaryMills راتب آخر يوم في الفترة عند وجود حد مرتبط بالراتب
 * @returns المبيعات المؤهلة والحد ومبالغ القاعدة والشريحة والإجمالي بالملّيم
 */
export function computeCommission(
  rules: PlanRules,
  lines: SalesLine[],
  salaryMills: Mills | null,
): CommissionResult {
  if (lines.some((line) => line.netMills < 0n)) throw new CommissionError("INVALID_LINE");
  const qualifyingSalesMills = lines.reduce((sum, line) => sum + line.netMills, 0n);
  const thresholdMills = rules.tier ? resolveThreshold(rules.tier.threshold, salaryMills) : null;
  const baseMills =
    rules.baseRateBp === null ? 0n : roundCommission(qualifyingSalesMills * rules.baseRateBp);
  const tierMills =
    rules.tier && thresholdMills !== null
      ? roundCommission(tierNumerator(rules.tier, qualifyingSalesMills, thresholdMills))
      : 0n;
  return {
    qualifyingSalesMills,
    thresholdMills,
    baseMills,
    tierMills,
    totalMills: baseMills + tierMills,
  };
}
