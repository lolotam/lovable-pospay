/**
 * يتحقق من صيغة رمز PIN الخاص بالمدير: أربعة أرقام ASCII بالضبط (020 B2).
 * لا يوجد عداد محاولات ولا قفل؛ كل محاولة فاشلة تسجّل فقط (قرار وليد 2).
 *
 * @param pin الرمز كما أدخله المدير
 * @returns true فقط عندما يطابق ^[0-9]{4}$
 */
export function isValidPin(pin: string): boolean {
  return /^[0-9]{4}$/.test(pin);
}
