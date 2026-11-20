/** محاولة PIN فاشلة كما تُقرأ لقائمة إساءة الاستخدام (020 B2، B3). */
export interface FailedPinAttemptRecord {
  id: string;
  branchId: string;
  sessionId: string;
  approverUserId: string;
  approverName: string | null;
  requestedBy: string;
  requesterName: string | null;
  userAgent: string | null;
  attemptedAt: Date;
}
/**
 * منفذ رمز PIN الخاص بالمدير الحالي؛ يعرض حالته فقط ولا يعيد الرمز
 * أو بصمته أبداً، ويسجل كل محاولة فاشلة في قاعدة البيانات (020 B2، B3).
 */
export interface ManagerPinRepository {
  /** يحفظ رمزاً جديداً أو يغيّر الحالي داخل الشركة الحالية. */
  setPin(pin: string): Promise<void>;
  /** هل للمدير الحالي رمز محفوظ في هذه الشركة؟ */
  hasPin(): Promise<boolean>;
  /** محاولات PIN الفاشلة في فروع الشركة للمالك والمعتمدين (020 B3). */
  listFailedAttempts(limit: number): Promise<FailedPinAttemptRecord[]>;
}
