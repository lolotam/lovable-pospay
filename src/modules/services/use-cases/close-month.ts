import type { SessionRepository } from "../ports/session-repository";

/** مدخلات إغلاق شهر عمولات؛ الشهر غير المنتهي يشترط تأكيداً صريحاً (020 D2). */
export interface CloseMonthInput {
  periodMonth: string;
  note?: string | undefined;
  confirmUnfinishedMonth?: boolean | undefined;
}

/**
 * يغلق شهر عمولات بإغلاق غير قابل للتراجع باسم المالك الحالي؛ قاعدة
 * البيانات ترفض غير المالك (RLS)، والشهر الذي لم ينته بعد يرفض إلا مع
 * تأكيد صريح لأنه يمنع التسجيل والتعديل في أرشيف هذا الشهر (020 D2).
 */
export async function closeMonth(repo: SessionRepository, input: CloseMonthInput): Promise<void> {
  const daysRemaining = await repo.monthCloseStatus(input.periodMonth);
  if (daysRemaining > 0 && input.confirmUnfinishedMonth !== true)
    throw new Error("MONTH_NOT_ENDED_CONFIRMATION_REQUIRED");
  await repo.closeMonth(input.periodMonth, input.note?.trim() || null);
}
