import { createServerFn } from "@tanstack/react-start";
import {
  serviceScope,
  getDiscountApprovalRequestInput,
  requestDiscountApprovalInput,
  decideDiscountApprovalInput,
  type PendingDiscountApprovalDto,
} from "../contracts";
/** يطلب اعتماد خصم بعدي؛ البوابات داخل SQL للطالب (020 B4.1) — بلا بوابة pos.access. */
export const requestDiscountApprovalFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => requestDiscountApprovalInput.parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { pgSessionRepository } = await import("../persistence/session.server");
    const { pgDiscountApprovalRepository } =
      await import("../persistence/discount-approval.server");
    const { requestDiscountApproval } = await import("../use-cases/discount-approval");
    const userId = await requireUserId();
    return withUser(userId, (db) =>
      requestDiscountApproval(
        pgSessionRepository(db, userId, data.companyId),
        pgDiscountApprovalRepository(db, data.companyId),
        data,
      ),
    );
  });
/** حالة طلب الاعتماد كما يراها الطالب في الاستطلاع الدوري كل 3 ثوان (020 B4.4). */
export const getDiscountApprovalRequestFn = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => getDiscountApprovalRequestInput.parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { pgDiscountApprovalRepository } =
      await import("../persistence/discount-approval.server");
    const { getDiscountApprovalStatus } = await import("../use-cases/discount-approval");
    return withUser(await requireUserId(), async (db) => {
      const status = await getDiscountApprovalStatus(
        pgDiscountApprovalRepository(db, data.companyId),
        data.requestId,
        new Date(),
      );
      return status ? { ...status, expiresAt: status.expiresAt.toISOString() } : null;
    });
  });
/** الطلبات المعلقة في فروع المعتمد الحالي (020 B4.2). */
export const listPendingDiscountApprovalsFn = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => serviceScope.parse(v))
  .handler(async ({ data }): Promise<PendingDiscountApprovalDto[]> => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { pgDiscountApprovalRepository } =
      await import("../persistence/discount-approval.server");
    const { listPendingDiscountApprovals } = await import("../use-cases/discount-approval");
    return withUser(await requireUserId(), async (db) => {
      const pending = await listPendingDiscountApprovals(
        pgDiscountApprovalRepository(db, data.companyId),
        data.companyId,
      );
      return pending.map((request) => ({
        id: request.id,
        branchId: request.branchId,
        branchName: request.branchName,
        serviceName: request.serviceName,
        listPriceMills: request.listPriceMills.toString(),
        requestedPriceMills: request.requestedPriceMills.toString(),
        discountReason: request.discountReason,
        requesterName: request.requesterName,
        createdAt: request.createdAt.toISOString(),
        expiresAt: request.expiresAt.toISOString(),
      }));
    });
  });
/** يعتمد أو يرفض طلباً باسم المعتمد الحالي؛ الطلب المغلق يرفض من SQL (020 B4.3). */
export const decideDiscountApprovalFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => decideDiscountApprovalInput.parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { pgDiscountApprovalRepository } =
      await import("../persistence/discount-approval.server");
    const { decideDiscountApproval } = await import("../use-cases/discount-approval");
    await withUser(await requireUserId(), (db) =>
      decideDiscountApproval(
        pgDiscountApprovalRepository(db, data.companyId),
        data.requestId,
        data.approve,
      ),
    );
    return { ok: true };
  });
