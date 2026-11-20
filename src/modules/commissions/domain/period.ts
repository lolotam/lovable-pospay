/** فترة عمولة شهرية ممثلة بسنة وشهر رقميين من دون ساعة أو منطقة زمنية. */
export interface CommissionPeriod {
  year: number;
  month: number;
}

/**
 * يرفض فترة غير صالحة (سنة أو شهر خارج النطاق) قبل أي حساب تاريخ.
 *
 * @param period السنة والشهر المطلوبان
 * @throws RangeError عندما لا تكون السنة بين 1 و9999 أو الشهر بين 1 و12
 */
function assertPeriod(period: CommissionPeriod): void {
  const { year, month } = period;
  if (!Number.isInteger(year) || year < 1 || year > 9999)
    throw new RangeError("Invalid period year");
  if (!Number.isInteger(month) || month < 1 || month > 12)
    throw new RangeError("Invalid period month");
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/**
 * يحسب أول يوم في فترة العمولة بصيغة تاريخ ISO لاستخدامه عند حل إصدار الخطة.
 *
 * @param period السنة والشهر المطلوبان
 * @returns تاريخ أول الشهر بصيغة YYYY-MM-DD
 */
export function periodStart(period: CommissionPeriod): string {
  assertPeriod(period);
  return `${period.year.toString().padStart(4, "0")}-${pad(period.month)}-01`;
}

/**
 * يحسب أول يوم في الفترة التالية بصيغة ISO ليكون النهاية الحصرية للفترة
 * عند مقارنة أوقات السريان (تجاوزات العمولة 021 O5).
 *
 * @param period السنة والشهر المطلوبان
 * @returns تاريخ أول يوم في الشهر التالي بصيغة YYYY-MM-DD
 */
export function nextPeriodStart(period: CommissionPeriod): string {
  const next =
    period.month === 12
      ? { year: period.year + 1, month: 1 }
      : { year: period.year, month: period.month + 1 };
  return periodStart(next);
}

/**
 * يحسب آخر يوم في فترة العمولة حسابياً، بما في ذلك 29 فبراير في السنة الكبيسة.
 *
 * @param period السنة والشهر المطلوبان
 * @returns تاريخ آخر يوم في الشهر بصيغة YYYY-MM-DD
 */
export function lastDayOfPeriod(period: CommissionPeriod): string {
  assertPeriod(period);
  const days = [31, isLeapYear(period.year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return `${period.year.toString().padStart(4, "0")}-${pad(period.month)}-${pad(days[period.month - 1]!)}`;
}
