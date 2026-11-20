import { approvalRequestState } from "../domain/approval";
import type { ApprovalRequestState } from "../domain/approval";
import type {
  DiscountApprovalRepository,
  PendingDiscountApprovalRecord,
} from "../ports/discount-approval-repository";
import type { SessionRepository } from "../ports/session-repository";
import { servicePrice } from "./service-price";

/** مدخلات طلب اعتماد خصم بعدي؛ السعر يجب أن يكون أقل من سعر القائمة (020 B4.1). */
export interface RequestDiscountApprovalInput {
  sessionId: string;
  serviceId: string;
  staffId: string;
  price: string;
  /** سعر القائمة المخزّن في الجلسة المعدلة؛ يُغيب فيقارن بسعر الكتالوج الحالي. */
  listPrice?: string | undefined;
  discountReason: string;
}

/**
 * ينشئ طلب اعتماد بعدي لخصم فوق الحد بعد التحقق من أن السعر فعلاً
 * أقل من القائمة؛ عند تعديل جلسة قائمة تمرر قائمة الجلسة المخزنة كي
 * يتطابق ربط الاعتماد مع الحفظ حتى بعد تغير سعر الكتالوج (020 B4.1، D3).
 * صلاحية الطالب وسريان الطلب واللجوء للطلبات الأقدم تُحسم داخل دالة
 * قاعدة البيانات.
 */
export async function requestDiscountApproval(
  repo: SessionRepository,
  approvals: DiscountApprovalRepository,
  input: RequestDiscountApprovalInput,
): Promise<{ id: string }> {
  const reason = input.discountReason.trim();
  if (reason.length === 0) throw new Error("DISCOUNT_REASON_REQUIRED");
  const priceMills = servicePrice(input.price);
  const service = await repo.assignedService(input.serviceId, input.staffId);
  if (!service) throw new Error("NOT_ASSIGNED");
  const listPriceMills =
    input.listPrice !== undefined ? servicePrice(input.listPrice) : service.priceMills;
  if (priceMills >= listPriceMills) throw new Error("INVALID_PRICE");
  return approvals.requestApproval({
    branchId: service.branchId,
    sessionId: input.sessionId,
    serviceId: input.serviceId,
    listPriceMills,
    priceMills,
    reason,
  });
}

/** حالة طلب الاعتماد كما يراها الطالب في الاستطلاع الدوري (020 B4.4). */
export interface ApprovalRequestStatus {
  status: ApprovalRequestState;
  approverName: string | null;
  approverUserId: string | null;
  expiresAt: Date;
}

/** يقرأ حالة الطلب لحظة الآن، أو null إذا لم يعد الطلب موجوداً للطالب. */
export async function getDiscountApprovalStatus(
  approvals: DiscountApprovalRepository,
  requestId: string,
  now: Date,
): Promise<ApprovalRequestStatus | null> {
  const request = await approvals.getRequest(requestId);
  if (!request) return null;
  return {
    status: approvalRequestState(request, now),
    approverName: request.approverName,
    approverUserId: request.approverUserId,
    expiresAt: request.expiresAt,
  };
}

/** الطلبات المعلقة في فروع المعتمد الحالي (020 B4.2). */
export async function listPendingDiscountApprovals(
  approvals: DiscountApprovalRepository,
  companyId: string,
): Promise<PendingDiscountApprovalRecord[]> {
  return approvals.listPending(companyId);
}

/**
 * يعتمد أو يرفض طلباً باسم المعتمد الحالي؛ صلاحية المعتمد وحالة الطلب
 * (معلق وغير منتهي) تُرفض من قاعدة البيانات برمز APPROVAL_REQUEST_CLOSED.
 */
export async function decideDiscountApproval(
  approvals: DiscountApprovalRepository,
  requestId: string,
  approve: boolean,
): Promise<void> {
  await approvals.decide(requestId, approve);
}
