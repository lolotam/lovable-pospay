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
  /** معتمد الخصم عند الاعتماد بالرمز أو بعدياً؛ null بدون مسار اعتماد (020 B5). */
  approvedBy: string | null;
  /** معرف الموافقة المستهلكة؛ يكتب approved_at بالاستعلام الفرعي من صفها. */
  approvalId: string | null;
}
/** جلسة مسجلة كما تُقرأ للتعديل من قائمة المحررين المعتمدة (020 D5). */
export interface SessionForEdit {
  id: string;
  serviceId: string;
  serviceName: string;
  staffId: string;
  branchId: string;
  timeZone: string;
  clientName: string;
  occurredAt: Date;
  listPriceMills: bigint;
  priceMills: bigint;
  discountReason: string | null;
  approvedBy: string | null;
  monthClosed: boolean;
  canEdit: boolean;
}
/** بيانات تعديل جلسة ترسل للدالة الذرية في قاعدة البيانات (020 D4). */
export interface SessionEdit {
  sessionId: string;
  serviceId: string;
  staffId: string;
  clientName: string;
  clientPhone: string | null;
  occurredAt: Date;
  priceMills: bigint;
  discountReason: string | null;
  approvalId: string | null;
  editReason: string;
}
/** معتمد خصم مؤهل في الفرع ولديه رمز PIN (020 B1، B3). */
export interface BranchApprover {
  userId: string;
  name: string;
}
/** نتيجة التحقق من رمز PIN: معتمد مع معرف الموافقة أو غير صحيح (020 B3). */
export type PinVerification = { status: "approved"; approvalId: string } | { status: "invalid" };
/** قفل يدوي لشهر عمولات مغلق؛ القائمة للعرض فقط. */
export interface ClosedMonthRecord {
  periodMonth: string;
  closedBy: string;
  closedAt: Date;
  note: string | null;
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
  /** هل الشهر المحلي للفرع الذي يقع فيه الوقت مغلق؟ (020 D2) */
  isMonthClosed(branchId: string, at: Date): Promise<boolean>;
  /** هل توجد جلسة مشابهة لنفس العميلة والخدمة والموظفة في نفس الدقيقة؟ (020 C1) */
  hasSimilarSession(input: {
    branchId: string;
    serviceId: string;
    staffId: string;
    clientPhone: string;
    occurredAt: Date;
    excludeId?: string;
  }): Promise<boolean>;
  /** معتمدو الفرع المؤهلون الذين لديهم رمز PIN (020 B1). */
  listBranchApprovers(branchId: string): Promise<BranchApprover[]>;
  /** يتحقق من رمز PIN ويصدر موافقة صالحة خمس دقائق أو يسجل المحاولة الفاشلة. */
  verifyManagerPin(input: {
    branchId: string;
    sessionId: string;
    serviceId: string;
    listPriceMills: bigint;
    priceMills: bigint;
    approverUserId: string;
    pin: string;
  }): Promise<PinVerification>;
  /** يستهلك الموافقة بعد الحفظ داخل المعاملة نفسها (020 B5). */
  consumeApproval(approvalId: string): Promise<void>;
  /** يقرأ الجلسة الحالية للتعديل برقمها، أو null خارج نطاق المحرر. */
  getSessionForEdit(sessionId: string): Promise<SessionForEdit | null>;
  /** هل المستخدم الحالي محرر جلسات مسنود للفرع؟ (020 D1) */
  canEditSession(branchId: string): Promise<boolean>;
  /** ينفذ التعديل الذري المدقق داخل قاعدة البيانات (020 D4). */
  updateSession(edit: SessionEdit): Promise<void>;
  /** يغلق شهراً باسم المالك الحالي (RLS يمنع غير المالك). */
  closeMonth(periodMonth: string, note: string | null): Promise<void>;
  /** أشهر العمولات المغلقة في الشركة. */
  listClosedMonths(): Promise<ClosedMonthRecord[]>;
  /** عدد الأيام المتبقية حتى نهاية الشهر في أقرب فرع (020 D2). */
  monthCloseStatus(periodMonth: string): Promise<number>;
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
