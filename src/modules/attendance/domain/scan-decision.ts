/** القواعد الزمنية المعتمدة للحضور (D-12، D-53). */
export const ATTENDANCE_RULES = {
  /** أقصى عمر لسجل مفتوح يُغلق بالمسح (16 ساعة). */
  maxOpenMs: 16 * 60 * 60 * 1000,
  /** بعد نهاية الوردية بهذه المدة يُعتبر الإغلاق متأخراً (4 ساعات). */
  lateCloseAfterShiftEndMs: 4 * 60 * 60 * 1000,
  /** فترة السماح للتأخير (10 دقائق). */
  graceMs: 10 * 60 * 1000,
  /** نافذة بداية الوردية المعتمدة: 30 دقيقة قبل البداية وبعدها (س2). */
  shiftStartWindowMs: 30 * 60 * 1000,
} as const;

/** وردية مجدولة. */
export interface ShiftWindow {
  /** معرّف الوردية. */
  id: string;
  /** بداية الوردية. */
  startsAt: Date;
  /** نهاية الوردية. */
  endsAt: Date;
}

/** سجل حضور مفتوح. */
export interface OpenRecord {
  /** معرّف السجل. */
  id: string;
  /** وقت الحضور. */
  checkInAt: Date;
  /** الوردية المرتبطة بالسجل إن وُجدت. */
  shift: ShiftWindow | null;
}

/** اختيار الموظفة عند تداخل الورديات (ق-6). */
export type ScanIntent = "new_shift" | "check_out";

/** مدخلات قرار المسح. */
export interface ScanInput {
  /** وقت المسح. */
  now: Date;
  /** السجل المفتوح الحالي إن وُجد. */
  open: OpenRecord | null;
  /** الوردية التالية المجدولة إن وُجدت. */
  nextShift: ShiftWindow | null;
  /** قصد الموظفة إن طُلب منها. */
  intent: ScanIntent | null;
}

/** نتيجة قرار المسح. */
export type ScanDecision =
  | { kind: "check_in"; shift: ShiftWindow | null }
  | { kind: "check_out"; recordId: string; status: "ok" | "closed_late" }
  | { kind: "forgotten_then_check_in"; forgottenId: string; shift: ShiftWindow | null }
  | { kind: "needs_intent"; recordId: string };

/**
 * يقرر نتيجة المسح: حضور، أو انصراف، أو انصراف منسي ثم حضور، أو سؤال الموظفة عن قصدها.
 * @param input حالة الموظفة لحظة المسح
 * @returns القرار، بدون أي أثر جانبي
 */
export function decideScan(input: ScanInput): ScanDecision {
  const { now, open, nextShift, intent } = input;
  if (!open) return { kind: "check_in", shift: nextShift };

  const openFor = now.getTime() - open.checkInAt.getTime();
  if (openFor > ATTENDANCE_RULES.maxOpenMs) {
    return { kind: "forgotten_then_check_in", forgottenId: open.id, shift: nextShift };
  }

  const atNewShiftStart =
    nextShift !== null &&
    nextShift.id !== open.shift?.id &&
    Math.abs(now.getTime() - nextShift.startsAt.getTime()) <= ATTENDANCE_RULES.shiftStartWindowMs;

  if (atNewShiftStart && intent === null) return { kind: "needs_intent", recordId: open.id };
  if (atNewShiftStart && intent === "new_shift") {
    return { kind: "forgotten_then_check_in", forgottenId: open.id, shift: nextShift };
  }
  return { kind: "check_out", recordId: open.id, status: closeStatus(now, open.shift) };
}

function closeStatus(now: Date, shift: ShiftWindow | null): "ok" | "closed_late" {
  if (!shift) return "ok";
  const lateAfter = shift.endsAt.getTime() + ATTENDANCE_RULES.lateCloseAfterShiftEndMs;
  return now.getTime() > lateAfter ? "closed_late" : "ok";
}

/**
 * يحسب دقائق التأخير بعد فترة السماح. التأخير للتقرير فقط ولا يخصم من الراتب (D-12).
 * @returns دقائق التأخير من بداية الوردية، أو صفر داخل فترة السماح
 */
export function lateMinutes(checkInAt: Date, shift: ShiftWindow | null): number {
  if (!shift) return 0;
  const diff = checkInAt.getTime() - shift.startsAt.getTime();
  if (diff <= ATTENDANCE_RULES.graceMs) return 0;
  return Math.floor(diff / 60000);
}

/**
 * يحدد يوم العمل بتاريخ بداية الحضور في منطقة الفرع الزمنية (D-32، D-10).
 * @param timeZone المنطقة الزمنية للفرع، مثل Asia/Kuwait
 * @returns التاريخ بصيغة YYYY-MM-DD
 */
export function workDate(checkInAt: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(checkInAt);
}
