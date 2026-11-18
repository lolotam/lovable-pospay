/** خدمة مسندة لموظفة مع فرعها وسعر الكتالوج الحالي. */
export interface AssignedService {
  serviceName: string;
  priceMills: bigint;
  branchId: string;
  timeZone: string;
}
/** جلسة خدمة جاهزة للحفظ. */
export interface NewSession {
  id: string;
  serviceId: string;
  staffId: string;
  branchId: string;
  clientId: string;
  occurredAt: Date;
  serviceName: string;
  priceMills: bigint;
}
/** منفذ تخزين الجلسات داخل معاملة المستخدم الحالي. */
export interface SessionRepository {
  assignedService(serviceId: string, staffId: string): Promise<AssignedService | null>;
  canWrite(branchId: string): Promise<boolean>;
  resolveTime(local: string, timeZone: string): Promise<Date>;
  lockRecordedSession(id: string): Promise<boolean>;
  upsertClient(branchId: string, name: string, phone: string): Promise<string>;
  insertSession(session: NewSession): Promise<void>;
  audit(sessionId: string, details: unknown): Promise<void>;
}
