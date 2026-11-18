import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { discountGrantInput, discountRevokeInput, serviceScope } from "../contracts";
const expectedUser = { expectedUserId: z.string().min(1) };
export const getDiscountSettingsFn = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => serviceScope.extend(expectedUser).parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { readDiscountSettings } = await import("../persistence/discount.server");
    const userId = await requireUserId();
    if (userId !== data.expectedUserId) throw new Error("FORBIDDEN");
    return withUser(userId, (db) => readDiscountSettings(db, data.companyId));
  });
export const saveDiscountGrantFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => discountGrantInput.extend(expectedUser).parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { saveDiscountGrant } = await import("../persistence/discount.server");
    const userId = await requireUserId();
    if (userId !== data.expectedUserId) throw new Error("FORBIDDEN");
    await withUser(userId, (db) =>
      saveDiscountGrant(db, userId, data.companyId, data.target, data.maxPercent),
    );
    return { ok: true };
  });
export const revokeDiscountGrantFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => discountRevokeInput.extend(expectedUser).parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { revokeDiscountGrant } = await import("../persistence/discount.server");
    const userId = await requireUserId();
    if (userId !== data.expectedUserId) throw new Error("FORBIDDEN");
    await withUser(userId, (db) => revokeDiscountGrant(db, userId, data.companyId, data.id));
    return { ok: true };
  });
