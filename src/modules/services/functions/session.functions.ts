import { loadSessionForm, recordAvailableSession } from "../use-cases/record-session";
import { createServerFn } from "@tanstack/react-start";
import {
  serviceScope,
  recordSessionInput,
  editSessionInput,
  listEditableSessionsInput,
  listSessionEditsInput,
  closeMonthInput,
  monthCloseStatusInput,
  type RecordSessionRequest,
  type EditSessionRequest,
} from "../contracts";
export const getSessionFormFn = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => serviceScope.parse(v))
  .handler(({ data }) =>
    loadSessionForm(async () => {
      const { requireUserId } = await import("@/lib/server/session.server");
      const { withUser } = await import("@/lib/server/db.server");
      const { withPermission } = await import("@/modules/permissions/index.server");
      const { readSessionForm } = await import("../persistence/session.server");
      return withUser(await requireUserId(), (db) =>
        withPermission(db, data.companyId, "pos.access", () => readSessionForm(db, data.companyId)),
      );
    }),
  );
/** يقتطع ترويسة user-agent إلى 200 حرفاً لتدقيق محاولات PIN (020 B3). */
function userAgentFrom(headers: Headers): string | null {
  const raw = headers.get("user-agent");
  return raw ? raw.slice(0, 200) : null;
}
export const recordSessionFn = createServerFn({ method: "POST" })
  .inputValidator((v: RecordSessionRequest) => v)
  .handler(({ data }) =>
    recordAvailableSession(async () => {
      const { requireUserId } = await import("@/lib/server/session.server");
      const { withUser } = await import("@/lib/server/db.server");
      const { withPermission } = await import("@/modules/permissions/index.server");
      const { getRequestHeaders } = await import("@tanstack/react-start/server");
      const { pgSessionRepository } = await import("../persistence/session.server");
      const { pgDiscountApprovalRepository } =
        await import("../persistence/discount-approval.server");
      const { recordSession } = await import("../use-cases/record-session");
      const userId = await requireUserId();
      const request = recordSessionInput.parse(data);
      return withUser(userId, (db) =>
        withPermission(db, request.companyId, "pos.access", () =>
          recordSession(
            pgSessionRepository(
              db,
              userId,
              request.companyId,
              userAgentFrom(getRequestHeaders() as unknown as Headers),
            ),
            pgDiscountApprovalRepository(db, request.companyId),
            request,
            new Date(),
          ),
        ),
      );
    }),
  );
/** قائمة الجلسات القابلة للتعديل في نطاق زمني؛ البوابات داخل دوال SQL (020 D5). */
export const listEditableSessionsFn = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => listEditableSessionsInput.parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { listEditableSessions } = await import("../persistence/session-edit.server");
    return withUser(await requireUserId(), (db) =>
      listEditableSessions(db, data.companyId, data.from, data.until, data.limit ?? 50),
    );
  });
/** يحفظ تعديل جلسة مسجلة؛ صلاحية المحرر وقفل الشهر داخل SQL والاستخدام (020 D4). */
export const editSessionFn = createServerFn({ method: "POST" })
  .inputValidator((v: EditSessionRequest) => v)
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { getRequestHeaders } = await import("@tanstack/react-start/server");
    const { pgSessionRepository } = await import("../persistence/session.server");
    const { pgDiscountApprovalRepository } =
      await import("../persistence/discount-approval.server");
    const { editSession } = await import("../use-cases/edit-session");
    const userId = await requireUserId();
    const request = editSessionInput.parse(data);
    return withUser(userId, (db) =>
      editSession(
        pgSessionRepository(
          db,
          userId,
          request.companyId,
          userAgentFrom(getRequestHeaders() as unknown as Headers),
        ),
        pgDiscountApprovalRepository(db, request.companyId),
        request,
        new Date(),
      ),
    );
  });
/** تاريخ تعديلات جلسة واحدة؛ RLS يخفيه عن غير المصرح لهم (020 D4). */
export const listSessionEditsFn = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => listSessionEditsInput.parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { readSessionEdits } = await import("../persistence/session-edit.server");
    return withUser(await requireUserId(), (db) =>
      readSessionEdits(db, data.companyId, data.sessionId, data.limit ?? 50),
    );
  });
/** أشهر العمولات المغلقة في الشركة للعرض. */
export const listClosedMonthsFn = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => serviceScope.parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { readClosedMonths } = await import("../persistence/session-edit.server");
    return withUser(await requireUserId(), (db) => readClosedMonths(db, data.companyId));
  });
/** خيارات نافذة التعديل لمن يملك تعديل جلسات فرعه، بلا صلاحية عمولات (020 D1). */
export const listSessionEditPickersFn = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => serviceScope.parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { listSessionEditPickers } = await import("../persistence/session-edit.server");
    return withUser(await requireUserId(), (db) => listSessionEditPickers(db, data.companyId));
  });
/** يغلق شهر عمولات؛ RLS يسمح للمالك فقط (020 D2). */
export const closeMonthFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => closeMonthInput.parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { pgSessionRepository } = await import("../persistence/session.server");
    const { closeMonth } = await import("../use-cases/close-month");
    const userId = await requireUserId();
    await withUser(userId, (db) =>
      closeMonth(pgSessionRepository(db, userId, data.companyId), {
        periodMonth: data.periodMonth,
        note: data.note,
        confirmUnfinishedMonth: data.confirmUnfinishedMonth,
      }),
    );
    return { ok: true };
  });
/** حالة قفل الشهر قبل الإغلاق: الأيام المتبقية (020 D2). */
export const getMonthCloseStatusFn = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => monthCloseStatusInput.parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { pgSessionRepository } = await import("../persistence/session.server");
    const userId = await requireUserId();
    return withUser(userId, async (db) => ({
      periodMonth: data.periodMonth,
      daysRemaining: await pgSessionRepository(db, userId, data.companyId).monthCloseStatus(
        data.periodMonth,
      ),
    }));
  });
