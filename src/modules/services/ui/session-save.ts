import { t, type MessageKey } from "@/i18n";
import type {
  ApprovalUnavailableState,
  BranchApproverDto,
  EditSessionResult,
  RecordSessionResult,
} from "../contracts";

/** رموز أخطاء الحفظ المترجمة؛ ما عداها يعامَل كخطأ عام. */
export const sessionSaveErrorCodes = [
  "DISCOUNT_OVER_LIMIT",
  "DISCOUNT_REASON_REQUIRED",
  "IDEMPOTENCY_CONFLICT",
  "FUTURE_SESSION",
  "INVALID_PRICE",
  "PERIOD_CLOSED",
  "NOT_ASSIGNED",
  "EDIT_REASON_REQUIRED",
  "CLIENT_PHONE_REQUIRED",
] as const;

/** رسالة الحفظ من رمز خطأ مرفوع من الخادم. */
export function sessionSaveMessage(code: string): string {
  return t(
    (sessionSaveErrorCodes as readonly string[]).includes(code)
      ? (`sessions.${code}` as MessageKey)
      : "sessions.error",
  );
}

/** إجراء العرض المشتق من نتيجة حفظ جلسة أو تعديلها (020 C2، B4). */
export type SaveOutcomeAction =
  | { kind: "saved" }
  | { kind: "duplicate" }
  | { kind: "pin_required"; approvers: BranchApproverDto[] }
  | { kind: "message"; message: string };

/** يحول نتيجة الحفظ إلى إجراء عرض واحد يستهلكه نموذج التسجيل ونموذج التعديل. */
export function saveOutcomeAction(
  result: RecordSessionResult | EditSessionResult,
): SaveOutcomeAction {
  switch (result.status) {
    case "saved":
      return { kind: "saved" };
    case "duplicate_warning":
      return { kind: "duplicate" };
    case "pin_required":
      return { kind: "pin_required", approvers: result.approvers };
    case "pin_invalid":
      return { kind: "message", message: t("sessions.pinInvalid") };
    default: {
      const state = (result as { state: ApprovalUnavailableState }).state;
      return { kind: "message", message: t(`sessions.approvalUnavailable.${state}` as MessageKey) };
    }
  }
}
