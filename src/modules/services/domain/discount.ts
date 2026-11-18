/** نتيجة فحص خصم جلسة: null تعني مقبول، وإلا رمز الخطأ. */
export type DiscountError = "PRICE_ABOVE_LIST" | "DISCOUNT_OVER_LIMIT" | "DISCOUNT_REASON_REQUIRED";

/**
 * يتحقق أن السعر المعدّل لا يتجاوز سعر الخدمة ولا ينزل عن حد الخصم المسموح.
 * الحساب بالـ mills (bigint) بدون كسور عشرية.
 */
export function checkDiscount(
  listMills: bigint,
  priceMills: bigint,
  capPercent: number,
  reason: string,
): DiscountError | null {
  if (priceMills === listMills) return null;
  if (priceMills > listMills || priceMills < 0n) return "PRICE_ABOVE_LIST";
  if (priceMills * 100n < listMills * BigInt(100 - capPercent)) return "DISCOUNT_OVER_LIMIT";
  if (!reason.trim()) return "DISCOUNT_REASON_REQUIRED";
  return null;
}
