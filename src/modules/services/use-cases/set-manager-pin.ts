import { isValidPin } from "../domain/pin";
import type { ManagerPinRepository } from "../ports/manager-pin-repository";

/**
 * يحفظ رمز PIN الخاص بالمدير الحالي بعد التحقق من صيغته؛ يبثه قاعدة
 * البيانات مع hash bcrypt ولا يعود الرمز إلى التطبيق أبداً (020 B2).
 */
export async function setManagerPin(repo: ManagerPinRepository, pin: string): Promise<void> {
  if (!isValidPin(pin)) throw new Error("INVALID_PIN");
  await repo.setPin(pin);
}

/** هل للمدير الحالي رمز PIN محفوظ في الشركة؟ */
export async function getManagerPinStatus(repo: ManagerPinRepository): Promise<boolean> {
  return repo.hasPin();
}
