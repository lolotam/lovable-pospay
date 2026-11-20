/** طلب اعتماد خصم بعدي كما يقرؤه المجال، مع بيانات الاعتماد المرتبط به. */
export interface ApprovalRequestRecord {
  id: string;
  status: "pending" | "approved" | "rejected" | "superseded";
  expiresAt: Date;
  branchId: string;
  sessionId: string;
  serviceId: string;
  listPriceMills: bigint;
  requestedPriceMills: bigint;
  discountReason: string;
  approverName: string | null;
  /** معتمد الطلب (decided_by)؛ null قبل القرار (020 B4.3). */
  approverUserId: string | null;
  approvalId: string | null;
  approvalExpiresAt: Date | null;
  approvalConsumedAt: Date | null;
}

/** حقول ربط الموافقة بحفظ الجلسة المرسل من الاستقبال. */
export interface ApprovalBinding {
  branchId: string;
  sessionId: string;
  serviceId: string;
  listPriceMills: bigint;
  priceMills: bigint;
}

/** حالة طلب الاعتماد كما تعرض للاستقبال أثناء الانتظار. */
export type ApprovalRequestState = "waiting" | "approved" | "rejected" | "expired";

/**
 * يحل حالة طلب الاعتماد لحظة زمنية معينة دون أي وصول لقاعدة البيانات.
 * الطلب البديل (superseded) يعرض منتهياً دائماً (020 B4.1)، والاعتماد المنتهي
 * أو المستهلك يجعل الحالة منتهية حتى لو كان الطلب معتمداً (020 B4.4).
 *
 * @param request الطلب المقروء من المخزن
 * @param now اللحظة الحالية الممررة من الخادم
 * @returns waiting أو approved أو rejected أو expired
 */
export function approvalRequestState(
  request: ApprovalRequestRecord,
  now: Date,
): ApprovalRequestState {
  if (request.status === "rejected") return "rejected";
  if (request.status === "approved") {
    const approvalUsable =
      request.approvalId !== null &&
      request.approvalExpiresAt !== null &&
      request.approvalExpiresAt.getTime() > now.getTime() &&
      request.approvalConsumedAt === null;
    return approvalUsable ? "approved" : "expired";
  }
  if (request.status === "superseded") return "expired";
  return request.expiresAt.getTime() > now.getTime() ? "waiting" : "expired";
}

/** سبب عدم توفر الموافقة البعدية المشتق من حالة الطلب (020 B4.4). */
export type ApprovalUnavailableReason = "pending" | "rejected" | "expired";

/**
 * يحول حالة طلب الاعتماد إلى سبب عدم التوفر كما يفهمه العرض؛ الطلب
 * المنتظر pending والمرفوض rejected وكل ما عداهما منتهٍ expired.
 *
 * @param state حالة الطلب المحسومة
 * @returns pending أو rejected أو expired
 */
export function approvalUnavailableReason(state: ApprovalRequestState): ApprovalUnavailableReason {
  if (state === "rejected") return "rejected";
  if (state === "waiting") return "pending";
  return "expired";
}

/**
 * يتحقق أن الموافقة المعتمدة مرتبطة بنفس حمولة الحفظ المرسلة: الجلسة والخدمة
 * والفرع وسعر القائمة والسعر المطلوب (020 B4.5)؛ أي اختلاف يعني mismatch.
 *
 * @param request الطلب المقروء من المخزن
 * @param payload حقول الربط من نموذج الحفظ الحالي
 * @returns true عندما تتطابق كل الحقول
 */
export function approvalMatches(request: ApprovalRequestRecord, payload: ApprovalBinding): boolean {
  return (
    request.branchId === payload.branchId &&
    request.sessionId === payload.sessionId &&
    request.serviceId === payload.serviceId &&
    request.listPriceMills === payload.listPriceMills &&
    request.requestedPriceMills === payload.priceMills
  );
}
