import { createServerFn } from "@tanstack/react-start";
import {
  accountProviderSchema,
  apiKeySchema,
  defaultAiSchema,
  loginIdSchema,
  providerSchema,
  type ConnectorsStatusDto,
  type LoginPollDto,
  type LoginStartDto,
} from "../contracts";
import type pg from "pg";

async function asSuperAdmin<T>(fn: (db: pg.PoolClient, userId: string) => Promise<T>): Promise<T> {
  const { requireUserId } = await import("@/lib/server/session.server");
  const { withUser } = await import("@/lib/server/db.server");
  const { requireSuperAdmin } = await import("../persistence/credentials.server");
  const userId = await requireUserId();
  return withUser(userId, async (db) => {
    await requireSuperAdmin(db);
    return fn(db, userId);
  });
}

export const getConnectorsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<ConnectorsStatusDto> =>
    asSuperAdmin(async (db) => (await import("../persistence/credentials.server")).listStatus(db)),
);

export const startAccountLoginFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => accountProviderSchema.parse(v))
  .handler(async ({ data }): Promise<LoginStartDto> =>
    asSuperAdmin(async (db, userId) => {
      const { startLogin } = await import("../persistence/oauth-flows.server");
      const { saveLogin, audit } = await import("../persistence/credentials.server");
      const p = data.provider as Parameters<typeof startLogin>[0];
      const s = await startLogin(p);
      const loginId = await saveLogin(db, userId, p, s.state, s.expiresInSec);
      await audit(db, userId, "connector.login_started", p);
      return {
        loginId,
        userCode: s.userCode ?? null,
        verificationUrl: s.verificationUrl,
        expiresInSec: s.expiresInSec,
      };
    }),
  );

export const pollAccountLoginFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => loginIdSchema.parse(v))
  .handler(async ({ data }): Promise<LoginPollDto> =>
    asSuperAdmin(async (db, userId) => {
      const { pollLogin } = await import("../persistence/oauth-flows.server");
      const store = await import("../persistence/credentials.server");
      const login = await store.readLogin(db, data.loginId);
      if (!login) return { status: "failed", message: "EXPIRED" };
      const r = await pollLogin(login.provider, login.state);
      if (r.status === "pending") return r;
      await store.dropLogin(db, data.loginId);
      if (r.status === "failed") return r;
      await store.saveCredential(db, userId, login.provider, "account", r.credential);
      await store.audit(db, userId, "connector.connected", login.provider);
      return { status: "complete" };
    }),
  );

export const saveApiKeyFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => apiKeySchema.parse(v))
  .handler(async ({ data }) =>
    asSuperAdmin(async (db, userId) => {
      const store = await import("../persistence/credentials.server");
      await store.saveCredential(db, userId, data.provider, "api_key", { access: data.value });
      await store.audit(db, userId, "connector.key_saved", data.provider);
      return { ok: true };
    }),
  );

export const disconnectFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => providerSchema.parse(v))
  .handler(async ({ data }) =>
    asSuperAdmin(async (db, userId) => {
      const store = await import("../persistence/credentials.server");
      await store.deleteCredential(db, data.provider);
      await store.audit(db, userId, "connector.disconnected", data.provider);
      return { ok: true };
    }),
  );

export const testConnectorFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => defaultAiSchema.parse(v))
  .handler(async ({ data }) =>
    asSuperAdmin(async (db, userId) => {
      const { isAllowedModel } = await import("../domain/providers");
      if (!isAllowedModel(data.provider, data.model)) throw new Error("MODEL_NOT_ALLOWED");
      const { callConnector } = await import("../persistence/ai-call.server");
      const reply = await callConnector(
        db,
        userId,
        data.provider,
        data.model,
        "Reply in one short sentence.",
        "Say that the PosPay connection works.",
      );
      return { reply: reply.slice(0, 300) };
    }),
  );

export const setDefaultAiFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => defaultAiSchema.parse(v))
  .handler(async ({ data }) =>
    asSuperAdmin(async (db, userId) => {
      const { isAllowedModel } = await import("../domain/providers");
      if (!isAllowedModel(data.provider, data.model)) throw new Error("MODEL_NOT_ALLOWED");
      await db.query(
        `insert into public.platform_settings (key,value) values ('ai.provider',$1),('ai.model',$2)
         on conflict (key) do update set value=excluded.value, updated_at=now()`,
        [data.provider, data.model],
      );
      const { audit } = await import("../persistence/credentials.server");
      await audit(db, userId, "connector.default_set", data.provider);
      return { ok: true };
    }),
  );
