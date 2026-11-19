/** بيانات طلب تسجيل الجلسة بعد التطبيع وقبل حل قيم السيرفر. */
export interface SessionRequestFields {
  serviceId: string;
  staffId: string;
  clientName: string;
  normalizedPhone: string;
  occurredAt: string;
  priceMills?: bigint | undefined;
  reason?: string | undefined;
}

/**
 * يبني تمثيلاً ثابتاً لطلب الجلسة كما أرسله المستخدم لربط مفتاح idempotency بالبيانات الأصلية.
 * السعر هنا هو المدخل اختيارياً، وليس سعر الكتالوج الذي يحله السيرفر.
 *
 * @param input بيانات الطلب بعد تطبيع الهاتف وتحويل السعر المدخل إلى mills
 * @returns نص JSON ثابت يصلح لحساب بصمة الطلب
 */
export function sessionRequestPayload(input: SessionRequestFields): string {
  return JSON.stringify([
    "session-request-v1",
    input.serviceId.toLowerCase(),
    input.staffId.toLowerCase(),
    input.clientName.trim(),
    input.normalizedPhone,
    input.occurredAt,
    input.priceMills?.toString() ?? null,
    input.reason?.trim() || null,
  ]);
}
