import { z } from "zod";
export const serviceScope = z.object({ companyId: z.string().uuid() });
export const saveServiceInput = serviceScope.extend({
  id: z.string().uuid().optional(),
  requestId: z.string().uuid().optional(),
  version: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(120),
  price: z.string().regex(/^\d{1,12}(\.\d{1,3})?$/),
  staffIds: z.array(z.string().uuid()).max(500),
});
export type SaveServiceInput = z.infer<typeof saveServiceInput>;
export interface ServiceDto {
  id: string;
  name: string;
  priceMills: string;
  version: number;
  staffIds: string[];
}
export interface ServiceCatalogDto {
  canManage: boolean;
  services: ServiceDto[];
  staff: { id: string; name: string }[];
}
export interface SessionReportRow {
  id: string;
  name: string;
  service: string;
  occurredAt: string;
  timeZone: string;
  priceMills: string;
  clientName: string | null;
  late: boolean | null;
}
export const recordSessionInput = serviceScope.extend({
  requestId: z.string().uuid(),
  serviceId: z.string().uuid(),
  staffId: z.string().uuid(),
  clientName: z.string().trim().min(1).max(120),
  clientPhone: z.string().trim().min(8).max(24),
  occurredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  price: z
    .string()
    .regex(/^\d{1,12}(\.\d{1,3})?$/)
    .optional(),
  discountReason: z.string().trim().max(200).optional(),
  confirmDuplicate: z.boolean().optional(),
  managerApproval: z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("pin"), approverUserId: z.string().min(1), pin: z.string() }),
      z.object({ kind: z.literal("remote"), approvalRequestId: z.string().uuid() }),
    ])
    .optional(),
});
export type RecordSessionRequest = z.input<typeof recordSessionInput>;
/** رمز الدخول الرقمي للمدير: أربعة أرقام ASCII بالضبط (020 B2). */
export const pinCodeSchema = z.string().regex(/^[0-9]{4}$/);
/** موافقة المدير على خصم فوق الحد: رمز PIN على الجهاز أو طلب بعدي معتمد. */
export const managerApprovalSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("pin"),
    approverUserId: z.string().min(1).max(100),
    pin: pinCodeSchema,
  }),
  z.object({ kind: z.literal("remote"), approvalRequestId: z.string().uuid() }),
]);
/** مدير مؤهل لاعتماد الخصم في الفرع ولديه رمز PIN محفوظ. */
export interface BranchApproverDto {
  userId: string;
  name: string;
}
/** حالة الموافقة غير المتاحة عند حفظ جلسة بخصم فوق الحد. */
export type ApprovalUnavailableState = "pending" | "rejected" | "expired" | "used" | "mismatch";
/** نتيجة محاولة حفظ جلسة: محفوظة أو أحد إخفاقات الضوابط قبل الكتابة. */
export type RecordSessionResult =
  | { status: "saved"; id: string; replayed: boolean }
  | { status: "duplicate_warning" }
  | { status: "pin_required"; approvers: BranchApproverDto[] }
  | { status: "pin_invalid" }
  | { status: "approval_unavailable"; state: ApprovalUnavailableState };
export interface SessionFormDto {
  canRecord: boolean;
  discountCap: number;
  services: { id: string; name: string; priceMills: string; staffIds: string[] }[];
  staff: { id: string; name: string; timeZone: string }[];
}
export const companyRoles = ["reception", "staff", "accountant", "viewer"] as const;
export const discountGrantInput = serviceScope.extend({
  target: z.union([
    z.object({ kind: z.literal("role"), role: z.enum(companyRoles) }),
    z.object({ kind: z.literal("user"), userId: z.string().min(1).max(100) }),
  ]),
  maxPercent: z.number().int().min(1).max(100),
});
export const discountRevokeInput = serviceScope.extend({ id: z.string().uuid() });
export interface DiscountGrantDto {
  id: string;
  role: string | null;
  userId: string | null;
  name: string | null;
  maxPercent: number;
}
export interface DiscountSettingsDto {
  canManage: boolean;
  grants: DiscountGrantDto[];
  members: { userId: string; name: string }[];
}
/** إدخال أو تغيير رمز PIN الخاص بالمدير الحالي في الشركة (020 B2). */
export const setManagerPinInput = serviceScope.extend({ pin: pinCodeSchema });
/** حالة رمز PIN للمدير الحالي؛ لا يعيد الرمز نفسه أبداً. */
export interface ManagerPinStatusDto {
  hasPin: boolean;
}
/** محاولة PIN فاشلة مسجلة للعرض على المالك ومديري الفروع. */
export interface FailedPinAttemptDto {
  id: string;
  branchId: string;
  sessionId: string;
  approverUserId: string;
  approverName: string | null;
  requestedBy: string;
  requesterName: string | null;
  userAgent: string | null;
  attemptedAt: string;
}
/** طلب اعتماد خصم بعدي كما يراه الطالب أو المعتمد. */
export interface DiscountApprovalRequestDto {
  id: string;
  branchId: string;
  sessionId: string;
  serviceId: string;
  listPriceMills: string;
  requestedPriceMills: string;
  discountReason: string;
  requestedBy: string;
  requesterName: string | null;
  createdAt: string;
  expiresAt: string;
  approverName: string | null;
}
/** طلب اعتماد معلّق في صندوق المعتمدين (020 B4.2). */
export interface PendingDiscountApprovalDto {
  id: string;
  branchId: string;
  branchName: string;
  serviceName: string;
  listPriceMills: string;
  requestedPriceMills: string;
  discountReason: string;
  requesterName: string;
  createdAt: string;
  expiresAt: string;
}
export const requestDiscountApprovalInput = serviceScope.extend({
  sessionId: z.string().uuid(),
  serviceId: z.string().uuid(),
  staffId: z.string().uuid(),
  price: z.string().regex(/^\d{1,12}(\.\d{1,3})?$/),
  /** سعر القائمة المخزّن في الجلسة عند تعديل جلسة قائمة (020 D3)؛ يُغيب للتسجيل الجديد. */
  listPrice: z
    .string()
    .regex(/^\d{1,12}(\.\d{1,3})?$/)
    .optional(),
  discountReason: z.string().trim().min(1).max(200),
});
export const getDiscountApprovalRequestInput = serviceScope.extend({
  requestId: z.string().uuid(),
});
export const decideDiscountApprovalInput = serviceScope.extend({
  requestId: z.string().uuid(),
  approve: z.boolean(),
});
/** إغلاق شهر عمولات؛ الشهر غير المنتهي يشترط تأكيداً صريحاً (020 D2). */
export const closeMonthInput = serviceScope.extend({
  periodMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01$/),
  note: z.string().trim().max(200).optional(),
  confirmUnfinishedMonth: z.boolean().optional(),
});
export const monthCloseStatusInput = serviceScope.extend({
  periodMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01$/),
});
/** حالة قفل شهر قبل الإغلاق: عدد الأيام المتبقية حتى نهايته. */
export interface MonthCloseStatusDto {
  periodMonth: string;
  daysRemaining: number;
}
/** شهر عمولات مغلق؛ القائمة للعرض فقط ولا يمكن إعادة فتحه. */
export interface ClosedMonthDto {
  periodMonth: string;
  closedBy: string;
  closedAt: string;
  note: string | null;
}
/** جلسة قابلة للتعديل في قائمة المحررين، برقم هاتف مقنع (020 D3، D-43). */
export interface EditableSessionDto {
  id: string;
  serviceId: string;
  serviceName: string;
  staffId: string;
  staffName: string;
  branchId: string;
  timeZone: string;
  clientName: string;
  clientPhoneLast3: string | null;
  occurredAt: string;
  recordedAt: string;
  listPriceMills: string;
  priceMills: string;
  discountReason: string | null;
  approvedBy: string | null;
  approverName: string | null;
  monthClosed: boolean;
  canEdit: boolean;
  editCount: number;
}
/** خيارات نافذة تعديل الجلسة: موظفات فروع المحرر والخدمات المسندة لهن (020 D1). */
export interface SessionEditPickersDto {
  services: { id: string; name: string; staffIds: string[] }[];
  staff: { id: string; name: string }[];
}
/** from/until أيام تقويم بتوقيت كل فرع محلياً وشاملة للطرفين (020 D5). */
export const listEditableSessionsInput = serviceScope.extend({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  limit: z.number().int().min(1).max(200).optional(),
});
export const editSessionInput = serviceScope.extend({
  sessionId: z.string().uuid(),
  serviceId: z.string().uuid(),
  staffId: z.string().uuid(),
  clientName: z.string().trim().min(1).max(120),
  clientPhone: z.string().trim().min(8).max(24).optional(),
  occurredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  price: z.string().regex(/^\d{1,12}(\.\d{1,3})?$/),
  discountReason: z.string().trim().max(200).optional(),
  editReason: z.string().trim().min(1).max(200),
  managerApproval: managerApprovalSchema.optional(),
});
export type EditSessionRequest = z.input<typeof editSessionInput>;
/** نتيجة محاولة تعديل جلسة: محفوظة أو أحد إخفاقات الضوابط قبل الكتابة. */
export type EditSessionResult =
  | { status: "saved"; sessionId: string }
  | { status: "pin_required"; approvers: BranchApproverDto[] }
  | { status: "pin_invalid" }
  | { status: "approval_unavailable"; state: ApprovalUnavailableState };
/** لقطة قبل/بعد لتعديل جلسة؛ لا تحمل رقم الهاتف الكامل أبداً (020 D4). */
export interface SessionEditSnapshot {
  sessionId: string;
  serviceId: string;
  serviceName: string;
  staffId: string;
  branchId: string;
  clientId: string;
  clientName: string;
  clientPhoneLast3: string;
  occurredAt: string;
  listPriceMills: string;
  priceMills: string;
  discountReason: string | null;
  approvedBy: string | null;
}
/** سجل تعديل واحد في تاريخ الجلسة. */
export interface SessionEditHistoryDto {
  id: string;
  sessionId: string;
  editedBy: string;
  editorName: string | null;
  editedAt: string;
  editReason: string;
  before: SessionEditSnapshot;
  after: SessionEditSnapshot;
}
export const listSessionEditsInput = serviceScope.extend({
  sessionId: z.string().uuid(),
  limit: z.number().int().min(1).max(200).optional(),
});
export const listFailedPinAttemptsInput = serviceScope.extend({
  limit: z.number().int().min(1).max(200).optional(),
});
