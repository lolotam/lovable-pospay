import type pg from "pg";
import type { ApprovalRequestRecord } from "../domain/approval";
import type {
  DiscountApprovalRepository,
  DiscountApprovalRequestView,
  PendingDiscountApprovalRecord,
} from "../ports/discount-approval-repository";
import { memberNames } from "./member-names.server";

/** صف الطلب كما تعيده قاعدة البيانات قبل التحويل إلى سجل المجال. */
type RequestRow = {
  id: string;
  status: "pending" | "approved" | "rejected" | "superseded";
  branch_id: string;
  session_id: string;
  service_id: string;
  list_price_mills: string;
  requested_price_mills: string;
  discount_reason: string;
  requested_by: string;
  created_at: Date;
  expires_at: Date;
  approver_user_id: string | null;
  approval_id: string | null;
  approval_expires_at: Date | null;
  approval_consumed_at: Date | null;
};

/**
 * ينفذ منفذ الموافقات البعدية؛ كل الكتابات تمر عبر دوال قاعدة البيانات
 * المدققة لأن pospay_app بلا منح كتابة على جدولي الطلبات والاعتمادات (020 B5).
 */
export function pgDiscountApprovalRepository(
  db: pg.PoolClient,
  companyId: string,
): DiscountApprovalRepository {
  return {
    async requestApproval(input) {
      const { rows } = await db.query<{ id: string }>(
        "select public.request_discount_approval($1,$2,$3,$4,$5,$6,$7) as id",
        [
          companyId,
          input.branchId,
          input.sessionId,
          input.serviceId,
          input.listPriceMills.toString(),
          input.priceMills.toString(),
          input.reason,
        ],
      );
      return { id: rows[0]!.id };
    },
    async getRequest(requestId) {
      const { rows } = await db.query<RequestRow>(
        `select q.id,q.status,q.branch_id,q.session_id,q.service_id,
                q.list_price_mills::text as list_price_mills,
                q.requested_price_mills::text as requested_price_mills,
                q.discount_reason,q.requested_by,q.created_at,q.expires_at,
                q.decided_by as approver_user_id,q.approval_id,
                a.expires_at as approval_expires_at,a.consumed_at as approval_consumed_at
         from public.discount_approval_requests q
         left join public.discount_approvals a
           on a.company_id = q.company_id and a.id = q.approval_id
         where q.company_id=$1 and q.id=$2`,
        [companyId, requestId],
      );
      if (!rows[0]) return null;
      const names = await memberNames(db, companyId);
      return mapRequest(rows[0], names);
    },
    async listPending() {
      const { rows } = await db.query<{
        id: string;
        branch_id: string;
        branch_name: string;
        service_name: string;
        list_price_mills: string;
        requested_price_mills: string;
        discount_reason: string;
        requester_name: string;
        created_at: Date;
        expires_at: Date;
      }>(
        `select id,branch_id,branch_name,service_name,
                list_price_mills::text as list_price_mills,
                requested_price_mills::text as requested_price_mills,
                discount_reason,requester_name,created_at,expires_at
         from public.list_pending_discount_approvals($1)`,
        [companyId],
      );
      return rows.map((row) => ({
        id: row.id,
        branchId: row.branch_id,
        branchName: row.branch_name,
        serviceName: row.service_name,
        listPriceMills: BigInt(row.list_price_mills),
        requestedPriceMills: BigInt(row.requested_price_mills),
        discountReason: row.discount_reason,
        requesterName: row.requester_name,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
      })) satisfies PendingDiscountApprovalRecord[];
    },
    async decide(requestId, approve) {
      await db.query("select public.decide_discount_approval($1,$2,$3)", [
        companyId,
        requestId,
        approve,
      ]);
    },
  };
}

function mapRequest(row: RequestRow, names: Map<string, string>): DiscountApprovalRequestView {
  return {
    id: row.id,
    status: row.status,
    branchId: row.branch_id,
    sessionId: row.session_id,
    serviceId: row.service_id,
    listPriceMills: BigInt(row.list_price_mills),
    requestedPriceMills: BigInt(row.requested_price_mills),
    discountReason: row.discount_reason,
    requestedBy: row.requested_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    approverName: row.approver_user_id ? (names.get(row.approver_user_id) ?? null) : null,
    approverUserId: row.approver_user_id,
    approvalId: row.approval_id,
    approvalExpiresAt: row.approval_expires_at,
    approvalConsumedAt: row.approval_consumed_at,
  } satisfies ApprovalRequestRecord & { createdAt: Date; requestedBy: string };
}
