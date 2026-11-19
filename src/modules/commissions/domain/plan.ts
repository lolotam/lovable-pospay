import type { Mills } from "@/shared/kernel/money";

/** طريقة تطبيق الشريحة: على الزيادة فقط أو على كل المبيعات بعد بلوغ الحد. */
export type TierMode = "excess" | "all_after";

/** حد الشريحة، إما مبلغ ثابت أو مضاعف صحيح بالألفية للراتب. */
export type TierThreshold =
  { kind: "fixed"; mills: Mills } | { kind: "salary_multiple"; multipleMilli: bigint };

/** شريحة عمولة واحدة بنسبة بنقاط الأساس وحد تفعيلها. */
export interface PlanTier {
  mode: TierMode;
  rateBp: bigint;
  threshold: TierThreshold;
}

/** قواعد إصدار الخطة: قاعدة اختيارية تضاف دائماً وشريحة اختيارية واحدة. */
export interface PlanRules {
  baseRateBp: bigint | null;
  tier: PlanTier | null;
}

/** صافي جلسة واحدة بعد الخصم ومن دون بقشيش، بالملّيم. */
export interface SalesLine {
  sessionId: string;
  netMills: Mills;
}

/** نتيجة حساب فترة كاملة مع فصل القاعدة والشريحة والحد المستخدم. */
export interface CommissionResult {
  qualifyingSalesMills: Mills;
  thresholdMills: Mills | null;
  baseMills: Mills;
  tierMills: Mills;
  totalMills: Mills;
}

/** أخطاء قواعد الخطة والحساب المعروفة للمستهلك. */
export type CommissionErrorCode =
  "PLAN_EMPTY" | "PLAN_INVALID" | "SALARY_REQUIRED" | "INVALID_LINE";

/** نتيجة التحقق من إصدار الخطة، وnull تعني أنه صالح. */
export type PlanValidationError = "PLAN_EMPTY" | "PLAN_INVALID" | null;

/** خطأ مجال برمز ثابت تستطيع طبقة العرض ترجمته من دون تحليل رسالة نصية. */
export class CommissionError extends Error {
  constructor(public readonly code: CommissionErrorCode) {
    super(code);
    this.name = "CommissionError";
  }
}

/**
 * يتحقق من قواعد إصدار الخطة قبل حفظه، بما فيها وجود جزء واحد وحدود النسب والعتبات.
 *
 * @param rules قواعد القاعدة والشريحة المطلوب حفظها
 * @returns رمز PLAN_EMPTY أو PLAN_INVALID، أو null عندما تكون القواعد صالحة
 */
export function validatePlanVersion(rules: PlanRules): PlanValidationError {
  if (rules.baseRateBp === null && !rules.tier) return "PLAN_EMPTY";
  if (rules.baseRateBp !== null && (rules.baseRateBp < 1n || rules.baseRateBp > 10000n))
    return "PLAN_INVALID";
  if (!rules.tier) return null;
  const { tier } = rules;
  if (tier.rateBp < 1n || tier.rateBp > 10000n || !tier.threshold) return "PLAN_INVALID";
  if (tier.threshold.kind === "fixed") return tier.threshold.mills < 0n ? "PLAN_INVALID" : null;
  return tier.threshold.multipleMilli <= 0n ? "PLAN_INVALID" : null;
}

/**
 * يتحقق أن تاريخ السريان النصي هو اليوم الأول من شهر ميلادي صالح البنية.
 *
 * @param effectiveMonth تاريخ السريان بصيغة YYYY-MM-DD
 * @returns true فقط عندما يكون اليوم 01 والشهر بين 01 و12
 */
export function isMonthStart(effectiveMonth: string): boolean {
  const match = /^(\d{4})-(\d{2})-01$/.exec(effectiveMonth);
  if (!match) return false;
  const month = Number(match[2]);
  return month >= 1 && month <= 12;
}
