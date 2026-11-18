import type pg from "pg";
import { withUser } from "@/lib/server/db.server";
import { needsRefresh } from "../domain/providers";
import { refreshCredential, type AccountProvider, type Credential } from "./oauth-flows.server";
import { open, seal } from "./vault.server";

export async function requireSuperAdmin(db: pg.PoolClient) {
  const { rows } = await db.query("select public.is_super_admin() as ok");
  if (rows[0]?.ok !== true) throw new Error("FORBIDDEN");
}
export async function audit(
  db: pg.PoolClient,
  userId: string,
  action: string,
  provider: string | null,
) {
  await db.query(
    "insert into public.platform_audit_log (actor_user_id,action,provider) values ($1,$2,$3)",
    [userId, action, provider],
  );
}
export async function saveCredential(
  db: pg.PoolClient,
  userId: string,
  provider: string,
  kind: "account" | "api_key",
  c: Credential,
) {
  await db.query(
    `insert into public.platform_credentials (provider,kind,secret,refresh_secret,expires_at,extras,updated_by,updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,now())
     on conflict (provider) do update set kind=excluded.kind, secret=excluded.secret, refresh_secret=excluded.refresh_secret,
       expires_at=excluded.expires_at, extras=excluded.extras, updated_by=excluded.updated_by, updated_at=now()`,
    [
      provider,
      kind,
      await seal(c.access),
      c.refresh ? await seal(c.refresh) : null,
      c.expires ? new Date(c.expires) : null,
      c.extras ?? {},
      userId,
    ],
  );
}
export async function deleteCredential(db: pg.PoolClient, provider: string) {
  await db.query("delete from public.platform_credentials where provider=$1", [provider]);
}
export async function listStatus(db: pg.PoolClient) {
  const creds = await db.query(
    "select provider, kind, updated_at, extras->>'email' as email from public.platform_credentials",
  );
  const settings = await db.query(
    "select key, value from public.platform_settings where key in ('ai.provider','ai.model')",
  );
  const s = Object.fromEntries(settings.rows.map((r) => [r.key, r.value as string]));
  return {
    connected: creds.rows.map((r) => ({
      provider: r.provider as string,
      kind: r.kind as string,
      updatedAt: (r.updated_at as Date).toISOString(),
      email: (r.email as string | null) ?? null,
    })),
    defaultProvider: s["ai.provider"] ?? null,
    defaultModel: s["ai.model"] ?? null,
  };
}
export async function loadCredential(
  userId: string,
  provider: string,
  rejectedAccess?: string,
): Promise<Credential> {
  return withUser(userId, async (db) => {
    await requireSuperAdmin(db);
    await db.query("set local lock_timeout = '3s'");
    // Wait for any refresh of this provider, then use the committed row.
    const { rows } = await db.query(
      "select * from public.platform_credentials where provider=$1 for update",
      [provider],
    );
    const row = rows[0];
    if (!row) throw new Error("NOT_CONNECTED");
    const c: Credential = {
      access: await open(row.secret),
      refresh: row.refresh_secret ? await open(row.refresh_secret) : null,
      expires: row.expires_at ? (row.expires_at as Date).getTime() : null,
      extras: row.extras ?? {},
    };
    const rejected = rejectedAccess === c.access;
    if (row.kind !== "account" || !(rejected || needsRefresh(c.expires ?? null, Date.now())))
      return c;

    const refreshed = await refreshCredential(provider as AccountProvider, c);
    await saveCredential(db, userId, provider, "account", refreshed);
    return refreshed;
  });
}
export async function saveLogin(
  db: pg.PoolClient,
  userId: string,
  provider: string,
  state: unknown,
  ttlSec: number,
) {
  const r = await db.query(
    `insert into public.platform_logins (provider,state,created_by,expires_at) values ($1,$2,$3,now()+make_interval(secs=>$4)) returning id`,
    [provider, await seal(JSON.stringify(state)), userId, ttlSec],
  );
  return r.rows[0].id as string;
}
export async function readLogin(db: pg.PoolClient, loginId: string) {
  const r = await db.query(
    "select provider,state from public.platform_logins where id=$1 and expires_at>now()",
    [loginId],
  );
  if (!r.rows[0]) return null;
  return {
    provider: r.rows[0].provider as AccountProvider,
    state: JSON.parse(await open(r.rows[0].state)),
  };
}
export async function dropLogin(db: pg.PoolClient, loginId: string) {
  await db.query("delete from public.platform_logins where id=$1", [loginId]);
}
