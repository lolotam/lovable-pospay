import type { ApprovalRequestRecord } from "../domain/approval";

/** طلب معتمد بعدي كما يراه صاحبه بعد القرار أو الانتهاء. */
export type DiscountApprovalRequestView = ApprovalRequestRecord & {
  createdAt: Date;
  requestedBy: string;
};

/** طلب اعتماد معلّق كما يظهر في صندوق المعتمدين (020 B4.2). */
export interface PendingDiscountApprovalRecord {
  id: string;
  branchId: string;
  branchName: string;
  serviceName: string;
  listPriceMills: bigint;
  requestedPriceMills: bigint;
  discountReason: string;
  requesterName: string;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * منفذ الموافقات البعدية على خصم فوق الحد: يطلب الاستقبال، ويقرأ حالته،
 * ويقرر المعتمد داخل دالة قاعدة البيانات المدققة (020 B4).
 */
export interface DiscountApprovalRepository {
  /** ينشئ طلباً معلقاً صالحاً خمس دقائق ويلغي طلبات صاحبه السابقة للجلسة. */
  requestApproval(input: {
    branchId: string;
    sessionId: string;
    serviceId: string;
    listPriceMills: bigint;
    priceMills: bigint;
    reason: string;
  }): Promise<{ id: string }>;
  /** يقرأ الطلب ببيانات اعتماده للتحقق من الحالة والربط. */
  getRequest(requestId: string): Promise<DiscountApprovalRequestView | null>;
  /** الطلبات المعلقة غير المنتهية في فروع المستخدم المعتمدة (020 B4.2). */
  listPending(companyId: string): Promise<PendingDiscountApprovalRecord[]>;
  /** يقرر الطلب اعتماداً أو رفضاً باسم المعتمد الحالي (020 B4.3). */
  decide(requestId: string, approve: boolean): Promise<void>;
}
