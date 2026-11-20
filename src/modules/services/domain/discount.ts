/**
 * نتيجة فحص سعر الجلسة: null تعني مقبول، وإلا رمز الخطأ.
 * رفع السعر فوق قائمة الخدمة مسموح مع سبب إلزامي (020 Q3)، والخصم تحت الحد
 * يحتاج سبباً أيضاً، وفوق الحد يحتاج اعتماد مدير في طبقة الاستخدام (020 A4، A5).
 */
export type DiscountError = "INVALID_PRICE" | "DISCOUNT_OVER_LIMIT" | "DISCOUNT_REASON_REQUIRED";

/**
 * يتحقق من سعر الجلسة مقابل سعر القائمة وحد الخصم المسموح، بالـ mills (bigint) بلا كسور.
 * سعر سالب مرفوض، والتساوي مع القائمة مقبول دائماً، والزيادة أو الخصم يشترطان سبباً،
 * والخصم تحت حد النسبة يعيد DISCOUNT_OVER_LIMIT ليتحوله الاستخدام إلى طلب اعتماد.
 *
 * @param listMills سعر القائمة المرجعي بالملّيم
 * @param priceMills السعر المطلوب تحصيله بالملّيم
 * @param capPercent أقصى نسبة خصم مسموحة للمستخدم الحالي (0 = بدون صلاحية)
 * @param reason سبب التعديل كما أدخله المستخدم
 * @returns null عند القبول أو رمز الخطأ المناسب
 */
export function checkDiscount(
  listMills: bigint,
  priceMills: bigint,
  capPercent: number,
  reason: string,
): DiscountError | null {
  if (priceMills < 0n) return "INVALID_PRICE";
  if (priceMills === listMills) return null;
  if (!reason.trim()) return "DISCOUNT_REASON_REQUIRED";
  if (priceMills > listMills) return null;
  if (priceMills * 100n < listMills * BigInt(100 - capPercent)) return "DISCOUNT_OVER_LIMIT";
  return null;
}
