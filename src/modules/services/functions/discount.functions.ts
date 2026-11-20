import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import {
  discountGrantInput,
  discountRevokeInput,
  listFailedPinAttemptsInput,
  serviceScope,
  setManagerPinInput,
} from "../contracts";
const expectedUser = { expectedUserId: z.string().min(1) };
export const getDiscountSettingsFn = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => serviceScope.extend(expectedUser).parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { withPermission } = await import("@/modules/permissions/index.server");
    const { readDiscountSettings } = await import("../persistence/discount.server");
    const userId = await requireUserId();
    if (userId !== data.expectedUserId) throw new Error("FORBIDDEN");
    return withUser(userId, (db) =>
      withPermission(db, data.companyId, "discounts.manage", () =>
        readDiscountSettings(db, data.companyId),
      ),
    );
  });
export const saveDiscountGrantFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => discountGrantInput.extend(expectedUser).parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { withPermission } = await import("@/modules/permissions/index.server");
    const { saveDiscountGrant } = await import("../persistence/discount.server");
    const userId = await requireUserId();
    if (userId !== data.expectedUserId) throw new Error("FORBIDDEN");
    await withUser(userId, (db) =>
      withPermission(db, data.companyId, "discounts.manage", () =>
        saveDiscountGrant(db, userId, data.companyId, data.target, data.maxPercent),
      ),
    );
    return { ok: true };
  });
export const revokeDiscountGrantFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => discountRevokeInput.extend(expectedUser).parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { withPermission } = await import("@/modules/permissions/index.server");
    const { revokeDiscountGrant } = await import("../persistence/discount.server");
    const userId = await requireUserId();
    if (userId !== data.expectedUserId) throw new Error("FORBIDDEN");
    await withUser(userId, (db) =>
      withPermission(db, data.companyId, "discounts.manage", () =>
        revokeDiscountGrant(db, userId, data.companyId, data.id),
      ),
    );
    return { ok: true };
  });
/** يحفظ رمز PIN للمدير الحالي؛ المالك ومدير الفرع فقط داخل SQL (020 B2). */
export const setManagerPinFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => setManagerPinInput.parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { pgManagerPinRepository } = await import("../persistence/manager-pin.server");
    const { setManagerPin } = await import("../use-cases/set-manager-pin");
    const userId = await requireUserId();
    await withUser(userId, (db) =>
      setManagerPin(pgManagerPinRepository(db, data.companyId), data.pin),
    );
    return { ok: true };
  });
/** حالة رمز PIN للمدير الحالي؛ لا يعيد الرمز نفسه أبداً (020 B2). */
export const getManagerPinStatusFn = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => serviceScope.parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { pgManagerPinRepository } = await import("../persistence/manager-pin.server");
    const { getManagerPinStatus } = await import("../use-cases/set-manager-pin");
    return withUser(await requireUserId(), async (db) => ({
      hasPin: await getManagerPinStatus(pgManagerPinRepository(db, data.companyId)),
    }));
  });
/** محاولات PIN الفاشلة؛ RLS يقيدها بالمالك ومعتمدي الفروع (020 B3). */
export const listFailedPinAttemptsFn = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => listFailedPinAttemptsInput.parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { pgManagerPinRepository } = await import("../persistence/manager-pin.server");
    return withUser(await requireUserId(), async (db) => {
      const attempts = await pgManagerPinRepository(db, data.companyId).listFailedAttempts(
        data.limit ?? 50,
      );
      return attempts.map((attempt) => ({
        id: attempt.id,
        branchId: attempt.branchId,
        sessionId: attempt.sessionId,
        approverUserId: attempt.approverUserId,
        approverName: attempt.approverName,
        requestedBy: attempt.requestedBy,
        requesterName: attempt.requesterName,
        userAgent: attempt.userAgent,
        attemptedAt: attempt.attemptedAt.toISOString(),
      }));
    });
  });
