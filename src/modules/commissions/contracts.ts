import { z } from "zod";

export const companyScope = z.object({ companyId: z.string().uuid() });
export type CompanyScope = z.infer<typeof companyScope>;
export const monthStartSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01$/);
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const kwdAmountSchema = z.string().regex(/^\d{1,12}(\.\d{1,3})?$/);
export const percentInputSchema = z.string().regex(/^\d{1,3}(\.\d{1,2})?$/);
export const salaryMultipleSchema = z.string().regex(/^\d{1,3}(\.\d{1,3})?$/);

/** شريحة مبيعات واحدة كما يدخلها المستخدم بنسب وأموال نصية بلا أرقام عائمة. */
const salesTierInput = z.object({
  ratePercent: percentInputSchema,
  threshold: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("fixed"), kwd: kwdAmountSchema }),
    z.object({ kind: z.literal("salary_multiple"), multiple: salaryMultipleSchema }),
  ]),
});
export const salesTierScheduleInput = z.object({
  accumulator: z.literal("sales_amount"),
  mode: z.enum(["excess", "all_after"]),
  thresholdKind: z.enum(["fixed", "salary_multiple"]),
  tiers: z.array(salesTierInput).min(1).max(20),
});
/** شريحة عدد جلسات كما يدخلها المستخدم. */
const sessionCountTierInput = z.object({
  afterSessions: z.number().int().min(0),
  reward: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("rate_bp"), ratePercent: percentInputSchema }),
    z.object({ kind: z.literal("fixed_mills"), kwd: kwdAmountSchema }),
  ]),
});
export const sessionCountTierScheduleInput = z.object({
  accumulator: z.literal("session_count"),
  mode: z.literal("excess"),
  tiers: z.array(sessionCountTierInput).min(1).max(20),
});
export const tierScheduleInput = z.discriminatedUnion("accumulator", [
  salesTierScheduleInput,
  sessionCountTierScheduleInput,
]);
export type TierScheduleInput = z.infer<typeof tierScheduleInput>;
/** قواعد الخطة كما تدخل من بانِي الخطط. */
export const planRulesInput = z.object({
  baseRatePercent: percentInputSchema.optional(),
  baseFixedKwd: kwdAmountSchema.optional(),
  tierSchedule: tierScheduleInput.optional(),
});
export type PlanRulesInput = z.infer<typeof planRulesInput>;

export const createPlanWithVersionInput = companyScope.extend({
  name: z.string().trim().min(1).max(80),
  effectiveMonth: monthStartSchema,
  rules: planRulesInput,
});
export const addPlanVersionInput = companyScope.extend({
  planId: z.string().uuid(),
  effectiveMonth: monthStartSchema,
  rules: planRulesInput,
});
export const assignPlanInput = companyScope.extend({
  staffId: z.string().uuid(),
  planId: z.string().uuid(),
  effectiveMonth: monthStartSchema,
});
/** حفظ تجاوز خدمة دون أي تاريخ سريان: قاعدة البيانات تضبط لحظة الحفظ (021 O5). */
export const saveServiceOverrideInput = companyScope.extend({
  serviceId: z.string().uuid(),
  staffId: z.string().uuid().nullable().optional(),
  override: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("rate_bp"), ratePercent: percentInputSchema }),
    z.object({ kind: z.literal("fixed_mills"), kwd: kwdAmountSchema }),
    z.object({ kind: z.literal("clear") }),
  ]),
});
export const listOverridesInput = companyScope.extend({
  staffId: z.string().uuid().nullable().optional(),
});
export const recordSalaryInput = companyScope.extend({
  staffId: z.string().uuid(),
  salaryKwd: kwdAmountSchema,
  effectiveDate: isoDateSchema,
});
export type RecordSalaryInputDto = z.infer<typeof recordSalaryInput>;
/** مدخل شاشة الخطط؛ الشهر اختياري ويحل إلى الشهر الحالي على الخادم. */
export const commissionPlansScreenInput = companyScope.extend({
  periodMonth: monthStartSchema.optional(),
});
/** مدخل شاشة الرواتب؛ الشهر غير مطلوب لأن السجل كامل بالتواريخ. */
export const staffSalariesScreenInput = companyScope;

/** قواعد خطة متسلسلة للعرض؛ كل المبالغ نصوص ملّيم ولا number للنقود. */
export interface PlanRulesDto {
  baseRateBp: string | null;
  baseFixedMills: string | null;
  tierSchedule:
    | {
        accumulator: "sales_amount";
        mode: "excess" | "all_after";
        thresholdKind: "fixed" | "salary_multiple";
        tiers: {
          rateBp: string;
          threshold:
            { kind: "fixed"; mills: string } | { kind: "salary_multiple"; multipleMilli: string };
        }[];
      }
    | {
        accumulator: "session_count";
        mode: "excess";
        tiers: {
          afterSessions: number;
          reward: { kind: "rate_bp"; rateBp: string } | { kind: "fixed_mills"; mills: string };
        }[];
      }
    | null;
}
/** إصدار خطة للعرض. */
export interface PlanVersionDto {
  id: string;
  version: number;
  effectiveMonth: string;
  rules: PlanRulesDto;
}
/** خطة للعرض مع إصداراتها. */
export interface CommissionPlanDto {
  id: string;
  name: string;
  versions: PlanVersionDto[];
}
/** موظفة وإسناندها الحالي؛ null تعني «بدون خطة» (021 Q8). */
export interface StaffPlanAssignmentDto {
  staffId: string;
  staffName: string;
  branchId: string;
  planId: string | null;
  planName: string | null;
  effectiveMonth: string | null;
}
export interface CommissionPlansScreenDto {
  plans: CommissionPlanDto[];
  staff: StaffPlanAssignmentDto[];
}
/** تجاوز خدمة للعرض؛ effectiveFrom بلحظة الحفظ من قاعدة البيانات. */
export interface ServiceOverrideDto {
  id: string;
  serviceId: string;
  serviceName: string;
  staffId: string | null;
  staffName: string | null;
  effectiveFrom: string;
  override:
    | { kind: "rate_bp"; rateBp: string }
    | { kind: "fixed_mills"; mills: string }
    | { kind: "clear" };
}
export interface ServiceOverridesScreenDto {
  canManage: boolean;
  services: { id: string; name: string }[];
  staff: { id: string; name: string; branchId: string }[];
  overrides: ServiceOverrideDto[];
}
/** راتب موظفة للعرض؛ كل المبالغ نصوص ملّيم. */
export interface StaffSalaryDto {
  id: string;
  staffId: string;
  staffName: string;
  branchId: string;
  salaryMills: string;
  effectiveDate: string;
  recordedAt: string;
}
export interface StaffSalariesScreenDto {
  staff: {
    staffId: string;
    staffName: string;
    branchId: string;
    currentSalaryMills: string | null;
    currentEffectiveDate: string | null;
    history: StaffSalaryDto[];
  }[];
}
