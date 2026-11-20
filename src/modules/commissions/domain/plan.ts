import type { Mills } from "@/shared/kernel/money";

/** طريقة تطبيق شريحة المبيعات: على الزيادة فقط أو على كل المبيعات بعد بلوغ الحد. */
export type TierMode = "excess" | "all_after";

/** حد شريحة مبيعات، إما مبلغ ثابت أو مضاعف صحيح بالألفية للراتب. */
export type TierThreshold =
  { kind: "fixed"; mills: Mills } | { kind: "salary_multiple"; multipleMilli: bigint };

/** شريحة مبيعات واحدة بنسبة بنقاط الأساس وحد تفعيلها. */
export interface SalesTier {
  rateBp: bigint;
  threshold: TierThreshold;
}

/** جدول شرائح يحسب على مبلغ المبيعات المؤهل (شرائح متدرجة أو رجوعية). */
export interface SalesTierSchedule {
  accumulator: "sales_amount";
  mode: TierMode;
  /** نوع حد كل شريحة؛ يجب أن يطابق نوع حدود الشرائح جميعها. */
  thresholdKind: "fixed" | "salary_multiple";
  tiers: SalesTier[];
}

/** مكافأة شريحة عدد جلسات: نسبة من صافي الجلسة أو مبلغ ثابت لها. */
export interface SessionCountTier {
  afterSessions: number;
  reward: { kind: "rate_bp"; rateBp: bigint } | { kind: "fixed_mills"; mills: Mills };
}

/** جدول شرائح يحسب على عدد الجلسات المؤهلة؛ النمط زيادة فقط. */
export interface SessionCountTierSchedule {
  accumulator: "session_count";
  mode: "excess";
  tiers: SessionCountTier[];
}

/** جدول الشرائح: إما بمبلغ المبيعات أو بعدد الجلسات. */
export type TierSchedule = SalesTierSchedule | SessionCountTierSchedule;

/** قواعد إصدار الخطة: قاعدة نسبية وثابتة وجدول شرائح، جميعها اختيارية. */
export interface PlanRules {
  baseRateBp: bigint | null;
  baseFixedMills: Mills | null;
  tierSchedule: TierSchedule | null;
}

/** صافي جلسة واحدة بعد الخصم ومن دون بقشيش، بوقت تنفيذها لحسم التجاوزات. */
export interface SalesLine {
  sessionId: string;
  serviceId?: string;
  occurredAt: Date;
  netMills: Mills;
}

/** تجاوز عمولة خدمة: نسبة بنقاط أساس أو مبلغ ثابت لكل جلسة. */
export type ServiceOverride =
  { kind: "rate_bp"; rateBp: bigint } | { kind: "fixed_mills"; mills: Mills };

/** صف تجاوز مخزّن؛ staff_id null يعني تجاوز الخدمة لكل الموظفات. */
export interface ServiceOverrideRow {
  id?: string;
  staffId: string | null;
  serviceId: string;
  effectiveFrom: Date;
  override: ServiceOverride | { kind: "clear" };
}

/** تاريخ تجاوزات الخدمات المستخدم لحسم كل بند عند وقته. */
export type ServiceOverrideHistory = ServiceOverrideRow[];

/** نتيجة حساب فترة كاملة بفصل القاعدة النسبية والثابتة والشرائح والتجاوزات. */
export interface CommissionResult {
  qualifyingSalesMills: Mills;
  qualifyingSessionCount: number;
  thresholdMills: Mills | null;
  baseRateMills: Mills;
  baseFixedMills: Mills;
  baseMills: Mills;
  tierMills: Mills;
  overrideMills: Mills;
  overrideSalesMills: Mills;
  overrideSessionCount: number;
  totalMills: Mills;
}

/** أخطاء قواعد الخطة والحساب المعروفة للمستهلك. */
export type CommissionErrorCode =
  | "PLAN_EMPTY"
  | "PLAN_INVALID"
  | "SALARY_REQUIRED"
  | "INVALID_LINE"
  | "COMMISSION_MONTH_CLOSED"
  | "OVERRIDE_INVALID";

/** نتيجة التحقق من إصدار الخطة، وnull تعني أنه صالح. */
export type PlanValidationError = "PLAN_EMPTY" | "PLAN_INVALID" | null;

/** خطأ مجال برمز ثابت تستطيع طبقة العرض ترجمته من دون تحليل رسالة نصية. */
export class CommissionError extends Error {
  constructor(public readonly code: CommissionErrorCode) {
    super(code);
    this.name = "CommissionError";
  }
}

const MAX_INTEGER = 2147483647n;
const MAX_BIGINT = 9223372036854775807n;
const MAX_TIERS = 20;

/**
 * يتحقق من اسم الخطة: من 1 إلى 80 حرفاً بعد حذف المسافات الطرفية، كما يشترط قيد الجدول.
 *
 * @param name اسم الخطة كما أدخله المستخدم
 * @returns true عندما يكون الاسم مقبولاً
 */
export function isValidPlanName(name: string): boolean {
  const length = name.trim().length;
  return length >= 1 && length <= 80;
}

/** يتحقق من صحة قاعدة نسبية واحدة؛ null تعني صالحة. */
function validateBaseRate(bp: bigint | null): PlanValidationError {
  if (bp !== null && (bp < 1n || bp > 10000n)) return "PLAN_INVALID";
  return null;
}

/** يتحقق من صحة مبلغ الجلسة الثابت؛ null تعني صالحة. */
function validateBaseFixed(mills: Mills | null): PlanValidationError {
  if (mills !== null && (mills <= 0n || mills > MAX_BIGINT)) return "PLAN_INVALID";
  return null;
}

/** يتحقق من جدول شرائح المبيعات: النمط ونوع الحدود والصعود الدقيق. */
function validateSalesSchedule(schedule: SalesTierSchedule): PlanValidationError {
  if (schedule.mode !== "excess" && schedule.mode !== "all_after") return "PLAN_INVALID";
  if (schedule.tiers.length < 1 || schedule.tiers.length > MAX_TIERS) return "PLAN_INVALID";
  let previous: Mills | null = null;
  for (const tier of schedule.tiers) {
    if (tier.rateBp < 1n || tier.rateBp > 10000n) return "PLAN_INVALID";
    if (tier.threshold.kind !== schedule.thresholdKind) return "PLAN_INVALID";
    if (tier.threshold.kind === "fixed") {
      const { mills } = tier.threshold;
      if (mills < 0n || mills > MAX_BIGINT) return "PLAN_INVALID";
      if (previous !== null && mills <= previous) return "PLAN_INVALID";
      previous = mills;
    } else {
      const { multipleMilli } = tier.threshold;
      if (multipleMilli <= 0n || multipleMilli > MAX_INTEGER) return "PLAN_INVALID";
    }
  }
  if (schedule.thresholdKind === "salary_multiple") {
    for (let index = 1; index < schedule.tiers.length; index++) {
      const current = schedule.tiers[index]!.threshold as { multipleMilli: bigint };
      const before = schedule.tiers[index - 1]!.threshold as { multipleMilli: bigint };
      if (current.multipleMilli <= before.multipleMilli) return "PLAN_INVALID";
    }
  }
  return null;
}

/** يتحقق من جدول شرائح عدد الجلسات: نمط الزيادة وحدود صحيحة صاعدة بدقة. */
function validateSessionCountSchedule(schedule: SessionCountTierSchedule): PlanValidationError {
  if (schedule.mode !== "excess") return "PLAN_INVALID";
  if (schedule.tiers.length < 1 || schedule.tiers.length > MAX_TIERS) return "PLAN_INVALID";
  let previous = -1;
  for (const tier of schedule.tiers) {
    if (!Number.isInteger(tier.afterSessions) || tier.afterSessions < 0) return "PLAN_INVALID";
    if (tier.afterSessions <= previous) return "PLAN_INVALID";
    previous = tier.afterSessions;
    if (tier.reward.kind === "rate_bp") {
      if (tier.reward.rateBp < 1n || tier.reward.rateBp > 10000n) return "PLAN_INVALID";
    } else if (tier.reward.mills <= 0n || tier.reward.mills > MAX_BIGINT) {
      return "PLAN_INVALID";
    }
  }
  return null;
}

/**
 * يتحقق من قواعد إصدار الخطة قبل حفظه: جزء واحد على الأقل، وحدود النسب
 * والمبالغ، وشرائح صاعدة بدقة من 1 إلى 20، وعدد الجلسات بنمط الزيادة فقط.
 *
 * @param rules قواعد الخطة المطلوب حفظها
 * @returns رمز PLAN_EMPTY أو PLAN_INVALID، أو null عندما تكون القواعد صالحة
 */
export function validatePlanVersion(rules: PlanRules): PlanValidationError {
  const empty = rules.baseRateBp === null && rules.baseFixedMills === null && !rules.tierSchedule;
  if (empty) return "PLAN_EMPTY";
  const baseError = validateBaseRate(rules.baseRateBp) ?? validateBaseFixed(rules.baseFixedMills);
  if (baseError) return baseError;
  if (!rules.tierSchedule) return null;
  return rules.tierSchedule.accumulator === "session_count"
    ? validateSessionCountSchedule(rules.tierSchedule)
    : validateSalesSchedule(rules.tierSchedule);
}

/**
 * يحسم التجاوز المسري لبند جلسة واحد عند وقته (021 O1، O2، O5): أحدث صف
 * موظفة (صفوف التاريخ المحددة لموظفة واحدة) قبل وقت البند، فإن كان مسحاً
 * انزل إلى أحدث صف خدمة عام، فإن كان مسحاً أو غاب انزل إلى خطة الموظفة.
 *
 * @param history تاريخ تجاوزات موظفة واحدة وصفود الخدمات العامة فقط
 * @param serviceId خدمة البند
 * @param occurredAt وقت تنفيذ البند
 * @returns التجاوز المسري أو null عندما تسري خطة الموظفة
 */
export function resolveOverride(
  history: ServiceOverrideHistory,
  serviceId: string,
  occurredAt: Date,
): ServiceOverride | null {
  const effective = history.filter(
    (row) => row.serviceId === serviceId && row.effectiveFrom <= occurredAt,
  );
  const staffLevel = latestOverride(effective, true);
  if (staffLevel !== undefined && staffLevel.kind !== "clear") return staffLevel;
  const serviceLevel = latestOverride(effective, false);
  if (serviceLevel !== undefined && serviceLevel.kind !== "clear") return serviceLevel;
  return null;
}

/** يختار أحدث تجاوز لمستوى واحد بترتيب وقت السريان ثم المعرف تنازلياً. */
function latestOverride(
  rows: ServiceOverrideRow[],
  staffLevel: boolean,
): ServiceOverride | { kind: "clear" } | undefined {
  const candidates = rows.filter((row) => (row.staffId !== null) === staffLevel);
  if (candidates.length === 0) return undefined;
  candidates.sort(
    (a, b) =>
      b.effectiveFrom.getTime() - a.effectiveFrom.getTime() ||
      (b.id ?? "").localeCompare(a.id ?? ""),
  );
  return candidates[0]!.override;
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
