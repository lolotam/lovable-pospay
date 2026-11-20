import type { PlanRulesInput } from "../contracts";
import { CommissionError } from "../domain/plan";

/** صف شريحة مبيعات كما يكتبه المستخدم بنصوص. */
export interface SalesTierRow {
  ratePercent: string;
  threshold: string;
}
/** صف شريحة عدد جلسات كما يكتبه المستخدم بنصوص. */
export interface SessionTierRow {
  afterSessions: string;
  rewardKind: "rate_bp" | "fixed_mills";
  rewardValue: string;
}

/** حالة بانِي الخطط: طرق قابلة للدمج مع جدول شرائح واحد (021 M6). */
export interface BuilderState {
  baseRateEnabled: boolean;
  baseRatePercent: string;
  baseFixedEnabled: boolean;
  baseFixedKwd: string;
  tiersEnabled: boolean;
  accumulator: "sales_amount" | "session_count";
  mode: "excess" | "all_after";
  thresholdKind: "fixed" | "salary_multiple";
  salesTiers: SalesTierRow[];
  sessionTiers: SessionTierRow[];
}

export const emptyBuilderState: BuilderState = {
  baseRateEnabled: false,
  baseRatePercent: "",
  baseFixedEnabled: false,
  baseFixedKwd: "",
  tiersEnabled: false,
  accumulator: "sales_amount",
  mode: "excess",
  thresholdKind: "fixed",
  salesTiers: [{ ratePercent: "", threshold: "" }],
  sessionTiers: [{ afterSessions: "", rewardKind: "rate_bp", rewardValue: "" }],
};

/** يركّب مدخل قواعد الخطة من حالة البانِي كما تشترطه العقود (021 M6). */
export function buildPlanRulesInput(state: BuilderState): PlanRulesInput {
  return {
    ...(state.baseRateEnabled && state.baseRatePercent.trim() !== ""
      ? { baseRatePercent: state.baseRatePercent }
      : {}),
    ...(state.baseFixedEnabled && state.baseFixedKwd.trim() !== ""
      ? { baseFixedKwd: state.baseFixedKwd }
      : {}),
    ...buildTierScheduleInput(state),
  };
}

function buildTierScheduleInput(state: BuilderState): Pick<PlanRulesInput, "tierSchedule"> {
  if (!state.tiersEnabled) return {};
  if (state.accumulator === "sales_amount") {
    return {
      tierSchedule: {
        accumulator: "sales_amount",
        mode: state.mode,
        thresholdKind: state.thresholdKind,
        tiers: state.salesTiers.map((row) => ({
          ratePercent: row.ratePercent,
          threshold:
            state.thresholdKind === "fixed"
              ? { kind: "fixed", kwd: row.threshold }
              : { kind: "salary_multiple", multiple: row.threshold },
        })),
      },
    };
  }
  return {
    tierSchedule: {
      accumulator: "session_count",
      mode: "excess",
      tiers: state.sessionTiers.map((row) => ({
        afterSessions: parseSessionCount(row.afterSessions),
        reward:
          row.rewardKind === "rate_bp"
            ? { kind: "rate_bp", ratePercent: row.rewardValue }
            : { kind: "fixed_mills", kwd: row.rewardValue },
      })),
    },
  };
}

/** عدد الجلسات أرقام فقط؛ الحقل الفاضي لا يتحول بصمت إلى صفر (021 M6). */
export function parseSessionCount(text: string): number {
  if (!/^\d+$/.test(text.trim())) throw new CommissionError("PLAN_INVALID");
  return Number(text.trim());
}
