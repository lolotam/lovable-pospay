import type { ApprovalUnavailableState, EditSessionResult } from "../contracts";
import { normalizePhone } from "../domain/client-phone";
import {
  approvalMatches,
  approvalRequestState,
  approvalUnavailableReason,
} from "../domain/approval";
import { checkDiscount } from "../domain/discount";
import type { SessionRepository } from "../ports/session-repository";
import type { DiscountApprovalRepository } from "../ports/discount-approval-repository";
import { servicePrice } from "./service-price";

/** مدخلات تعديل جلسة مسجلة؛ السعر إلزامي وسبب التعديل إلزامي (020 D3). */
export interface EditSessionInput {
  sessionId: string;
  /** وقت الجلسة كما ظهر في قائمة المحررين؛ يحدّ نطاق القراءة فقط. */
  hintOccurredAt: string;
  serviceId: string;
  staffId: string;
  clientName: string;
  clientPhone?: string | undefined;
  occurredAt: string;
  price: string;
  discountReason?: string | undefined;
  editReason: string;
  managerApproval?:
    | { kind: "pin"; approverUserId: string; pin: string }
    | { kind: "remote"; approvalRequestId: string }
    | undefined;
}
/** حسم مسار الاعتماد فوق الحد عند التعديل. */
type EditApprovalOutcome =
  | { kind: "fresh"; approvalId: string }
  | { kind: "preserve" }
  | { kind: "pin_invalid" }
  | { kind: "unavailable"; state: ApprovalUnavailableState }
  | { kind: "pin_required" };
/** بيانات التعديل اللازمة لحسم مسار الاعتماد فوق الحد. */
interface EditPriceContext {
  listPriceMills: bigint;
  priceMills: bigint;
  branchId: string;
}

/**
 * يعدل جلسة مسجلة تعديلاً ذرياً مدققاً دون أي كتابة مباشرة: التحقق من
 * صلاحية المحرر على الفرعين القديم والجديد، وقفل الشهر على الوقتين، ثم
 * السعر والسبب، وإعادة استخدام اعتماد الخصم القديم فقط عند ثبات الخدمة
 * والسعر والفرع (020 D3، D4). يحسم العميل ودقته داخل قاعدة البيانات،
 * فلا ينادي canWrite أو upsertClient لأن المحرر قد لا يكون كاتب جلسات.
 */
export async function editSession(
  repo: SessionRepository,
  approvals: DiscountApprovalRepository,
  input: EditSessionInput,
  now: Date,
): Promise<EditSessionResult> {
  const editReason = input.editReason.trim();
  if (editReason.length === 0 || editReason.length > 200) throw new Error("EDIT_REASON_REQUIRED");
  const existing = await repo.getSessionForEdit(input.sessionId, input.hintOccurredAt);
  if (existing?.monthClosed) throw new Error("PERIOD_CLOSED");
  if (!existing || !existing.canEdit) throw new Error("FORBIDDEN");
  const assignment = await repo.assignedService(input.serviceId, input.staffId);
  if (!assignment) throw new Error("NOT_ASSIGNED");
  if (!(await repo.canEditSession(assignment.branchId))) throw new Error("FORBIDDEN");
  const occurredAt = await repo.resolveTime(input.occurredAt, assignment.timeZone);
  if (occurredAt.getTime() > now.getTime()) throw new Error("FUTURE_SESSION");
  if (await repo.isMonthClosed(assignment.branchId, occurredAt)) throw new Error("PERIOD_CLOSED");
  const listPriceMills =
    input.serviceId === existing.serviceId ? existing.listPriceMills : assignment.priceMills;
  const priceMills = servicePrice(input.price);
  const reason = input.discountReason?.trim() ?? "";
  const priceError = checkDiscount(listPriceMills, priceMills, await repo.discountCap(), reason);
  if (priceError && priceError !== "DISCOUNT_OVER_LIMIT") throw new Error(priceError);
  const approvalId = await resolveApprovalForEdit(
    repo,
    approvals,
    input,
    existing,
    { listPriceMills, priceMills, branchId: assignment.branchId },
    priceError === "DISCOUNT_OVER_LIMIT",
    now,
  );
  if (typeof approvalId === "object") return approvalId;
  const clientName = input.clientName.trim();
  const clientPhone = input.clientPhone ? normalizePhone(input.clientPhone) : null;
  if (clientPhone === null && clientName !== existing.clientName.trim())
    throw new Error("CLIENT_PHONE_REQUIRED");
  await repo.updateSession({
    sessionId: input.sessionId,
    serviceId: input.serviceId,
    staffId: input.staffId,
    clientName,
    clientPhone,
    occurredAt,
    priceMills,
    discountReason: priceMills === listPriceMills ? null : reason,
    approvalId: approvalId === "preserve" ? null : approvalId,
    editReason,
  });
  return { status: "saved", sessionId: input.sessionId };
}

/** يحسم اعتماد الخصم فوق الحد، ويعيد معرف الموافقة الجديدة أو نتيجة للعرض. */
async function resolveApprovalForEdit(
  repo: SessionRepository,
  approvals: DiscountApprovalRepository,
  input: EditSessionInput,
  existing: {
    id: string;
    serviceId: string;
    branchId: string;
    priceMills: bigint;
    approvedBy: string | null;
  },
  context: EditPriceContext,
  overLimit: boolean,
  now: Date,
): Promise<string | "preserve" | EditSessionResult> {
  if (!overLimit) return "preserve";
  const approvalInput = input.managerApproval;
  if (!approvalInput) {
    const preservable =
      input.serviceId === existing.serviceId &&
      context.priceMills === existing.priceMills &&
      context.branchId === existing.branchId &&
      existing.approvedBy !== null;
    if (preservable) return "preserve";
    return { status: "pin_required", approvers: await repo.listBranchApprovers(context.branchId) };
  }
  if (approvalInput.kind === "pin") {
    const verification = await repo.verifyManagerPin({
      branchId: context.branchId,
      sessionId: existing.id,
      serviceId: input.serviceId,
      listPriceMills: context.listPriceMills,
      priceMills: context.priceMills,
      approverUserId: approvalInput.approverUserId,
      pin: approvalInput.pin,
    });
    return verification.status === "invalid" ? { status: "pin_invalid" } : verification.approvalId;
  }
  return resolveRemoteForEdit(
    approvals,
    approvalInput.approvalRequestId,
    existing,
    input.serviceId,
    context,
    now,
  );
}

/** يتحقق من الطلب البعدي وربطه قبل قبول اعتماده على التعديل (020 B4.5). */
async function resolveRemoteForEdit(
  approvals: DiscountApprovalRepository,
  approvalRequestId: string,
  existing: { id: string },
  editServiceId: string,
  context: EditPriceContext,
  now: Date,
): Promise<string | { status: "approval_unavailable"; state: ApprovalUnavailableState }> {
  const request = await approvals.getRequest(approvalRequestId);
  const state = request ? approvalRequestState(request, now) : "expired";
  if (state !== "approved" || request?.approvalConsumedAt !== null || !request?.approvalId) {
    return {
      status: "approval_unavailable",
      state: approvalUnavailableReason(state),
    };
  }
  const matched = approvalMatches(request, {
    branchId: context.branchId,
    sessionId: existing.id,
    serviceId: editServiceId,
    listPriceMills: context.listPriceMills,
    priceMills: context.priceMills,
  });
  return matched ? request.approvalId : { status: "approval_unavailable", state: "mismatch" };
}
