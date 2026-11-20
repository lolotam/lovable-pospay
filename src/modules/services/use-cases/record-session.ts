import type { RecordSessionResult, SessionFormDto } from "../contracts";
import { serviceSessionRecordingAvailable } from "../domain/session-availability";
import { normalizePhone } from "../domain/client-phone";
import {
  approvalMatches,
  approvalRequestState,
  approvalUnavailableReason,
} from "../domain/approval";
import { checkDiscount } from "../domain/discount";
import type { SessionFormRecord, SessionRepository } from "../ports/session-repository";
import type { DiscountApprovalRepository } from "../ports/discount-approval-repository";
import { servicePrice } from "./service-price";
import { sessionRequestPayload } from "../domain/session-request";

/** مدخلات تسجيل جلسة خدمة منفذة، مع تأكيد التكرار وموافقة المدير الاختيارية. */
export interface RecordSessionInput {
  requestId: string;
  serviceId: string;
  staffId: string;
  clientName: string;
  clientPhone: string;
  occurredAt: string;
  price?: string | undefined;
  discountReason?: string | undefined;
  confirmDuplicate?: boolean | undefined;
  managerApproval?:
    | { kind: "pin"; approverUserId: string; pin: string }
    | { kind: "remote"; approvalRequestId: string }
    | undefined;
}
/** الموافقة المستهلكة عند الحفظ ومعتمدها. */
interface ResolvedApproval {
  approvalId: string;
  approverUserId: string;
}
/** إما موافقة صالحة أو نتيجة نهائية تُعاد للعميل دون أي كتابة. */
type OverLimitOutcome = ResolvedApproval | { terminal: RecordSessionResult };

/**
 * يسجل جلسة خدمة للموظفة المسندة بالترتيب الإلزامي (020 C2): مفتاح
 * idempotency أولاً، ثم الإسناد والصلاحية والوقت وقفل الشهر، ثم السعر والسبب،
 * ثم تحذير الجلسة المشابهة، وأخيراً اعتماد المدير للخصم فوق الحد قبل الحفظ.
 * يعيد نتيجة الطلب السابق عند تكراره دون أي كتابة جديدة.
 */
export async function recordSession(
  repo: SessionRepository,
  approvals: DiscountApprovalRepository,
  input: RecordSessionInput,
  now: Date,
): Promise<RecordSessionResult> {
  const phone = normalizePhone(input.clientPhone);
  const name = input.clientName.trim();
  if (!name) throw new Error("INVALID_CLIENT");
  const enteredPrice = input.price ? servicePrice(input.price) : undefined;
  const requestPayload = sessionRequestPayload({
    serviceId: input.serviceId,
    staffId: input.staffId,
    clientName: name,
    normalizedPhone: phone,
    occurredAt: input.occurredAt,
    priceMills: enteredPrice,
    reason: input.discountReason,
  });
  const claim = await repo.claimRequest(input.requestId, requestPayload);
  if (claim === "replay") return { status: "saved", id: input.requestId, replayed: true };
  if (claim === "conflict") throw new Error("IDEMPOTENCY_CONFLICT");
  return saveValidatedSession(
    repo,
    approvals,
    input,
    { name, phone, enteredPrice, requestPayload },
    now,
  );
}

/** قيم الطلب بعد التطبيع، محسوبة مرة واحدة قبل حجز مفتاح الطلب. */
interface NormalizedRequest {
  name: string;
  phone: string;
  enteredPrice: bigint | undefined;
  requestPayload: string;
}

/** سياق الحفظ بعد فحوص الإسناد والصلاحية والوقت وقفل الشهر والسعر (020 C2). */
interface RecordingContext {
  service: {
    serviceName: string;
    priceMills: bigint;
    branchId: string;
    timeZone: string;
  };
  occurredAt: Date;
  priceMills: bigint;
  reason: string;
  priceError: ReturnType<typeof checkDiscount>;
}

/** يجري فحوص ما قبل الحفظ بالترتيب ويعيد قيم الحفظ المحسوبة. */
async function loadRecordingContext(
  repo: SessionRepository,
  input: RecordSessionInput,
  normalized: NormalizedRequest,
  now: Date,
): Promise<RecordingContext> {
  const service = await repo.assignedService(input.serviceId, input.staffId);
  if (!service) throw new Error("NOT_ASSIGNED");
  if (!(await repo.canWrite(service.branchId))) throw new Error("FORBIDDEN");
  const occurredAt = await repo.resolveTime(input.occurredAt, service.timeZone);
  if (occurredAt.getTime() > now.getTime()) throw new Error("FUTURE_SESSION");
  if (await repo.isMonthClosed(service.branchId, occurredAt)) throw new Error("PERIOD_CLOSED");
  const priceMills = normalized.enteredPrice ?? service.priceMills;
  const reason = input.discountReason?.trim() ?? "";
  const priceError = checkDiscount(
    service.priceMills,
    priceMills,
    await repo.discountCap(),
    reason,
  );
  if (priceError && priceError !== "DISCOUNT_OVER_LIMIT") throw new Error(priceError);
  return { service, occurredAt, priceMills, reason, priceError };
}

/** يمر بكل ضوابط الحفظ بالترتيب ثم يحفظ الجلسة والموافقة وسجل التدقيق. */
async function saveValidatedSession(
  repo: SessionRepository,
  approvals: DiscountApprovalRepository,
  input: RecordSessionInput,
  normalized: NormalizedRequest,
  now: Date,
): Promise<RecordSessionResult> {
  const id = input.requestId;
  const { service, occurredAt, priceMills, reason, priceError } = await loadRecordingContext(
    repo,
    input,
    normalized,
    now,
  );
  if (
    !input.confirmDuplicate &&
    (await repo.hasSimilarSession({
      branchId: service.branchId,
      serviceId: input.serviceId,
      staffId: input.staffId,
      clientPhone: normalized.phone,
      occurredAt,
    }))
  ) {
    return { status: "duplicate_warning" };
  }
  let approval: ResolvedApproval | null = null;
  if (priceError === "DISCOUNT_OVER_LIMIT") {
    const outcome = await resolveOverLimitApproval(
      repo,
      approvals,
      input,
      service,
      priceMills,
      now,
    );
    if ("terminal" in outcome) return outcome.terminal;
    approval = outcome;
  }
  const clientId = await repo.upsertClient(service.branchId, normalized.name, normalized.phone);
  await repo.insertSession({
    id,
    serviceId: input.serviceId,
    staffId: input.staffId,
    occurredAt,
    branchId: service.branchId,
    clientId,
    serviceName: service.serviceName,
    priceMills,
    listPriceMills: service.priceMills,
    discountReason: priceMills === service.priceMills ? null : reason,
    requestPayload: normalized.requestPayload,
    approvedBy: approval?.approverUserId ?? null,
    approvalId: approval?.approvalId ?? null,
  });
  if (approval) await repo.consumeApproval(approval.approvalId);
  await repo.audit(id, {
    serviceId: input.serviceId,
    staffId: input.staffId,
    priceMills: priceMills.toString(),
    listPriceMills: service.priceMills.toString(),
    discountReason: priceMills === service.priceMills ? null : reason,
    approvedBy: approval?.approverUserId ?? null,
    duplicateConfirmed: input.confirmDuplicate === true,
  });
  return { status: "saved", id, replayed: false };
}

/** يحسم مسار الخصم فوق الحد: بدون موافقة يطلب PIN، وبالرمز يتحقق، وبعدياً يقرأ الطلب. */
async function resolveOverLimitApproval(
  repo: SessionRepository,
  approvals: DiscountApprovalRepository,
  input: RecordSessionInput,
  service: { branchId: string; priceMills: bigint },
  priceMills: bigint,
  now: Date,
): Promise<OverLimitOutcome> {
  const approvalInput = input.managerApproval;
  if (!approvalInput) {
    return {
      terminal: {
        status: "pin_required",
        approvers: await repo.listBranchApprovers(service.branchId),
      },
    };
  }
  if (approvalInput.kind === "pin") {
    const verification = await repo.verifyManagerPin({
      branchId: service.branchId,
      sessionId: input.requestId,
      serviceId: input.serviceId,
      listPriceMills: service.priceMills,
      priceMills,
      approverUserId: approvalInput.approverUserId,
      pin: approvalInput.pin,
    });
    if (verification.status === "invalid") return { terminal: { status: "pin_invalid" } };
    return { approvalId: verification.approvalId, approverUserId: approvalInput.approverUserId };
  }
  return resolveRemoteApproval(
    approvals,
    approvalInput.approvalRequestId,
    {
      branchId: service.branchId,
      sessionId: input.requestId,
      serviceId: input.serviceId,
      listPriceMills: service.priceMills,
      priceMills,
    },
    now,
  );
}

/** يقرأ الطلب البعدي ويتحقق من حالته وربطه قبل السماح بالحفظ (020 B4.5). */
async function resolveRemoteApproval(
  approvals: DiscountApprovalRepository,
  approvalRequestId: string,
  binding: {
    branchId: string;
    sessionId: string;
    serviceId: string;
    listPriceMills: bigint;
    priceMills: bigint;
  },
  now: Date,
): Promise<OverLimitOutcome> {
  const request = await approvals.getRequest(approvalRequestId);
  if (!request) return { terminal: { status: "approval_unavailable", state: "expired" } };
  const state = approvalRequestState(request, now);
  if (state !== "approved") {
    return {
      terminal: { status: "approval_unavailable", state: approvalUnavailableReason(state) },
    };
  }
  if (request.approvalConsumedAt !== null) {
    return { terminal: { status: "approval_unavailable", state: "used" } };
  }
  if (!approvalMatches(request, binding) || request.approvalId === null) {
    return { terminal: { status: "approval_unavailable", state: "mismatch" } };
  }
  return {
    approvalId: request.approvalId,
    approverUserId: request.approverUserId ?? "",
  };
}

/** يجهز خيارات نموذج الجلسة عند إتاحة التسجيل. */
export async function loadSessionForm(
  read: () => Promise<SessionFormRecord>,
  available = serviceSessionRecordingAvailable,
): Promise<SessionFormDto> {
  if (!available) return { canRecord: false, discountCap: 0, services: [], staff: [] };
  const { canRecord, discountCap, services, staff } = await read();
  return {
    canRecord,
    discountCap,
    services: services.map((service) => ({
      ...service,
      priceMills: service.priceMills.toString(),
    })),
    staff,
  };
}

/** يسمح بتسجيل الجلسة فقط عندما يكون مفتاح الإتاحة مفتوحاً. */
export async function recordAvailableSession<T>(
  record: () => Promise<T>,
  available = serviceSessionRecordingAvailable,
): Promise<T> {
  if (!available) throw new Error("SESSION_RECORDING_UNAVAILABLE");
  return record();
}
