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
  listPriceMills: bigint;
  discountReason: string | null;
  requestPayload: string;
}
/** منفذ تخزين الجلسات داخل معاملة المستخدم الحالي. */
export interface SessionRepository {
  assignedService(serviceId: string, staffId: string): Promise<AssignedService | null>;
  canWrite(branchId: string): Promise<boolean>;
  resolveTime(local: string, timeZone: string): Promise<Date>;
  /** يقفل مفتاح الطلب داخل المعاملة ويحدد هل هو جديد أو تكرار صالح أو تعارض. */
  claimRequest(id: string, payload: string): Promise<"new" | "replay" | "conflict">;
  upsertClient(branchId: string, name: string, phone: string): Promise<string>;
  /** أقصى نسبة خصم مسموحة للمستخدم الحالي (0 = بدون صلاحية). */
  discountCap(): Promise<number>;
  insertSession(session: NewSession): Promise<void>;
  audit(sessionId: string, details: unknown): Promise<void>;
}

/** خيارات نموذج الجلسات مع الأسعار بالفلس. */
export interface SessionFormRecord {
  canRecord: boolean;
  discountCap: number;
  services: { id: string; name: string; priceMills: bigint; staffIds: string[] }[];
  staff: { id: string; name: string; timeZone: string }[];
}

/** سجل جلسة للتقرير، بوقت التنفيذ ووقت التسجيل وسعر الخدمة بالفلس. */
export interface SessionReportRecord {
  id: string;
  name: string;
  service: string;
  priceMills: bigint;
  occurredAt: Date;
  recordedAt: Date;
  timeZone: string;
  clientName: string | null;
}
