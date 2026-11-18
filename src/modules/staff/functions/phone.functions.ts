import { createServerFn } from "@tanstack/react-start";
import { phoneScopeSchema, phoneProofSchema, unbindSchema } from "../phone.contracts";

export const getPhoneManagementFn = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => phoneScopeSchema.parse(v))
  .handler(async ({ data }) => {
    const { setResponseHeader } = await import("@tanstack/react-start/server");
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { readPhoneManagement } = await import("../persistence/phone-management.server");
    const { getPhoneDeviceHash } = await import("../persistence/phone.server");
    const userId = await requireUserId();
    const deviceHash = await getPhoneDeviceHash();
    setResponseHeader("Cache-Control", "private, no-store");
    return withUser(userId, (db) => readPhoneManagement(db, userId, data.companyId, deviceHash));
  });

export const startBindingFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => phoneScopeSchema.parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { challenge } = await import("../persistence/phone.server");
    const userId = await requireUserId();
    return withUser(userId, (db) => challenge(db, userId, data.companyId, "bind"));
  });
export const finishBindingFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => phoneProofSchema.parse(v))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { prove, bindPhone } = await import("../persistence/phone.server");
    const { user, session } = await requireSession();
    const userId = user.id;
    return withUser(userId, async (db) => {
      const id = await prove(db, userId, data, "bind");
      await bindPhone(db, userId, data.companyId, id, session.id);
      return { ok: true };
    });
  });
export const unbindPhoneFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => unbindSchema.parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const userId = await requireUserId();
    return withUser(userId, async (db) => {
      const { requireDeviceManager } = await import("../persistence/phone-management.server");
      await requireDeviceManager(db, data.companyId);
      const r = await db.query(
        "delete from public.phone_bindings where company_id=$1 and user_id=$2 returning id",
        [data.companyId, data.userId],
      );
      if (!r.rows[0]) throw new Error("FORBIDDEN");
      await db.query(
        `insert into public.audit_log (company_id,actor_user_id,action,entity_id) values ($1,$2,'phone.unbound',$3)`,
        [data.companyId, userId, data.userId],
      );
      return { ok: true };
    });
  });
