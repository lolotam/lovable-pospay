/** يتحقق من وقت الانصراف المصحّح وسبب المدير بدون استنتاج ساعات أو خصومات. */
export function validateCorrection(
  checkInAt: Date,
  correctedAt: Date,
  reason: string,
  now: Date,
): string | null {
  if (!reason.trim()) return "REASON_REQUIRED";
  if (!Number.isFinite(correctedAt.getTime())) return "INVALID_CHECK_OUT";
  if (correctedAt.getTime() < checkInAt.getTime()) return "BEFORE_CHECK_IN";
  if (correctedAt.getTime() > now.getTime()) return "FUTURE_CHECK_OUT";
  return null;
}
