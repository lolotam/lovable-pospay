// Subscription sign-ins (device flows) ported from prolifepharma's ai-accounts.ts.
type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any
export type AccountProvider = "codex" | "kimi_coding" | "minimax_coding" | "zai_coding";
export interface Credential {
  access: string;
  refresh?: string | null | undefined;
  expires?: number | null | undefined;
  extras?: Json;
}
export interface LoginStart {
  userCode?: string;
  verificationUrl: string;
  state: Json;
  expiresInSec: number;
}
export type PollResult =
  | { status: "pending" }
  | { status: "complete"; credential: Credential }
  | { status: "failed"; message: string };
export class AuthRejected extends Error {}

const OPENAI_AUTH = "https://auth.openai.com";
const CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const KIMI_AUTH = "https://auth.kimi.ai";
const KIMI_CLIENT_ID = "17e5f671-d194-4dfb-9706-5516cb48c098";
const MINIMAX_AUTH = "https://account.minimax.io";
const MINIMAX_CLIENT_ID = "659cf4c1-615c-45f6-a5f6-4bf15eb476e5";
const ZCODE = "https://zcode.z.ai/api/v1";
const ZAI = "https://api.z.ai";
const PROVIDER_TIMEOUT_MS = 10_000;
const REFRESH_BODY_TIMEOUT_MS = 5_000;

const form = (body: Record<string, string>): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
  body: new URLSearchParams(body).toString(),
});
const postJson = (body: unknown, token?: string): RequestInit => ({
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  },
  body: JSON.stringify(body),
});
async function readJson(res: Response, signal?: AbortSignal): Promise<Json | null> {
  try {
    return (await res.json()) as Json;
  } catch {
    signal?.throwIfAborted();
    return null;
  }
}
function randomHex(n: number) {
  return Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
async function s256(v: string) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)));
  return Buffer.from(h).toString("base64url");
}
function jwtPayload(t: string): Json | null {
  try {
    return JSON.parse(Buffer.from(t.split(".")[1] ?? "", "base64url").toString()) as Json;
  } catch {
    return null;
  }
}
function oauthError(body: Json | null): string | null {
  const e = body?.error;
  const c = typeof e === "string" ? e : (e?.code ?? e?.error);
  return typeof c === "string" ? c : null;
}
function trusted(url: unknown, hosts: string[]) {
  try {
    const u = new URL(String(url));
    return u.protocol === "https:" && hosts.includes(u.hostname);
  } catch {
    return false;
  }
}

async function startCodex(): Promise<LoginStart> {
  const res = await fetch(
    `${OPENAI_AUTH}/api/accounts/deviceauth/usercode`,
    postJson({ client_id: CODEX_CLIENT_ID }),
  );
  const j = await readJson(res);
  if (!res.ok || !j?.device_auth_id || !j?.user_code) throw new Error(`CODEX_START_${res.status}`);
  return {
    userCode: j.user_code,
    verificationUrl: `${OPENAI_AUTH}/codex/device`,
    state: { deviceAuthId: j.device_auth_id, userCode: j.user_code },
    expiresInSec: 900,
  };
}
async function startKimi(): Promise<LoginStart> {
  const res = await fetch(
    `${KIMI_AUTH}/api/oauth/device_authorization`,
    form({ client_id: KIMI_CLIENT_ID }),
  );
  const j = await readJson(res);
  const url = j?.verification_uri_complete || j?.verification_uri;
  if (!res.ok || !j?.device_code || !trusted(url, ["auth.kimi.ai", "www.kimi.ai", "kimi.ai"]))
    throw new Error(`KIMI_START_${res.status}`);
  return {
    userCode: j.user_code,
    verificationUrl: url,
    state: { deviceCode: j.device_code },
    expiresInSec: Math.min(Number(j.expires_in) || 900, 900),
  };
}
async function startMinimax(): Promise<LoginStart> {
  const verifier = randomHex(32);
  const state = randomHex(16);
  const res = await fetch(
    `${MINIMAX_AUTH}/oauth2/device/code`,
    form({
      client_id: MINIMAX_CLIENT_ID,
      scope: "openid profile coding_plan",
      code_challenge: await s256(verifier),
      code_challenge_method: "S256",
      state,
    }),
  );
  const j = await readJson(res);
  if (
    !res.ok ||
    j?.state !== state ||
    !j?.user_code ||
    !trusted(j.verification_uri, ["account.minimax.io", "platform.minimax.io"])
  )
    throw new Error(`MINIMAX_START_${res.status}`);
  return {
    userCode: j.user_code,
    verificationUrl: j.verification_uri,
    state: { userCode: j.user_code, verifier },
    expiresInSec: 900,
  };
}
async function startZai(): Promise<LoginStart> {
  const pollToken = randomHex(32);
  const res = await fetch(`${ZCODE}/oauth/cli/init`, postJson({ provider: "zai" }, pollToken));
  const j = (await readJson(res))?.data;
  if (!res.ok || !j?.flow_id || !trusted(j.authorize_url, ["zcode.z.ai", "z.ai", "chat.z.ai"]))
    throw new Error(`ZAI_START_${res.status}`);
  return {
    verificationUrl: j.authorize_url,
    state: { flowId: j.flow_id, pollToken },
    expiresInSec: 900,
  };
}

export function startLogin(p: AccountProvider): Promise<LoginStart> {
  return {
    codex: startCodex,
    kimi_coding: startKimi,
    minimax_coding: startMinimax,
    zai_coding: startZai,
  }[p]();
}

function codexCredential(t: Json, prev: Credential | null = null): Credential {
  const accountId =
    jwtPayload(t.access_token)?.["https://api.openai.com/auth"]?.chatgpt_account_id ??
    prev?.extras?.accountId;
  return {
    access: t.access_token,
    refresh: t.refresh_token ?? prev?.refresh,
    expires: Date.now() + (Number(t.expires_in) || 3600) * 1000,
    extras: { ...(prev?.extras ?? {}), accountId },
  };
}
async function pollCodex(s: Json, signal: AbortSignal): Promise<PollResult> {
  const res = await fetch(`${OPENAI_AUTH}/api/accounts/deviceauth/token`, {
    ...postJson({ device_auth_id: s.deviceAuthId, user_code: s.userCode }),
    signal,
  });
  if (res.status === 403 || res.status === 404) return { status: "pending" };
  const j = await readJson(res, signal);
  if (!res.ok) {
    const c = oauthError(j);
    return c === "deviceauth_authorization_pending" || c === "slow_down"
      ? { status: "pending" }
      : { status: "failed", message: `HTTP ${res.status}` };
  }
  const tok = await fetch(`${OPENAI_AUTH}/oauth/token`, {
    ...form({
      grant_type: "authorization_code",
      client_id: CODEX_CLIENT_ID,
      code: j?.authorization_code,
      code_verifier: j?.code_verifier,
      redirect_uri: `${OPENAI_AUTH}/deviceauth/callback`,
    }),
    signal,
  });
  const t = await readJson(tok, signal);
  if (!tok.ok || !t?.access_token) return { status: "failed", message: `HTTP ${tok.status}` };
  return { status: "complete", credential: codexCredential(t) };
}
async function pollKimi(s: Json, signal: AbortSignal): Promise<PollResult> {
  const res = await fetch(`${KIMI_AUTH}/api/oauth/token`, {
    ...form({
      client_id: KIMI_CLIENT_ID,
      device_code: s.deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    }),
    signal,
  });
  const j = await readJson(res, signal);
  if (res.ok && j?.access_token)
    return {
      status: "complete",
      credential: {
        access: j.access_token,
        refresh: j.refresh_token,
        expires: Date.now() + (Number(j.expires_in) || 3600) * 1000,
      },
    };
  const c = oauthError(j);
  if (c === "authorization_pending" || c === "slow_down") return { status: "pending" };
  return { status: "failed", message: c ?? `HTTP ${res.status}` };
}
async function pollMinimax(s: Json, signal: AbortSignal): Promise<PollResult> {
  const res = await fetch(`${MINIMAX_AUTH}/oauth2/token`, {
    ...form({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      client_id: MINIMAX_CLIENT_ID,
      user_code: s.userCode,
      code_verifier: s.verifier,
    }),
    signal,
  });
  const j = await readJson(res, signal);
  if (!res.ok) return { status: "failed", message: `HTTP ${res.status}` };
  if (j?.status === "pending") return { status: "pending" };
  if (j?.status !== "success" || !j.access_token) return { status: "failed", message: "denied" };
  return {
    status: "complete",
    credential: { access: j.access_token, refresh: j.refresh_token, expires: Number(j.expired_in) },
  };
}
async function pollZai(s: Json, signal: AbortSignal): Promise<PollResult> {
  const res = await fetch(`${ZCODE}/oauth/cli/poll/${encodeURIComponent(s.flowId)}`, {
    headers: { Authorization: `Bearer ${s.pollToken}` },
    signal,
  });
  const d = (await readJson(res, signal))?.data;
  if (!res.ok) return { status: "failed", message: `HTTP ${res.status}` };
  if (d?.status === "pending") return { status: "pending" };
  const oauth = d?.zai?.access_token || d?.zai?.accessToken;
  if (d?.status !== "ready" || !oauth) return { status: "failed", message: "denied" };
  return {
    status: "complete",
    credential: await zaiProjectToken(oauth, { email: d.user?.email }, signal),
  };
}

export function pollLogin(p: AccountProvider, s: Json): Promise<PollResult> {
  return {
    codex: pollCodex,
    kimi_coding: pollKimi,
    minimax_coding: pollMinimax,
    zai_coding: pollZai,
  }[p](s, AbortSignal.timeout(PROVIDER_TIMEOUT_MS));
}

async function zaiJson(url: string, init: RequestInit) {
  const res = await fetch(url, init);
  const j = await readJson(res, init.signal ?? undefined);
  if (res.status === 401 || res.status === 403) throw new AuthRejected("ZAI_EXPIRED");
  if (!res.ok || (j?.code !== undefined && ![0, 200, "0", "200"].includes(j.code)))
    throw new Error(`ZAI_${res.status}`);
  return j?.data;
}
async function zaiLocation(biz: string, signal: AbortSignal): Promise<Json> {
  const cust = await zaiJson(`${ZAI}/api/biz/customer/getCustomerInfo`, {
    headers: { Authorization: biz },
    signal,
  });
  const orgs: Json[] = cust?.organizations ?? [];
  const org =
    orgs.find((o) => o.organizationName?.includes("默认机构")) ??
    orgs.find((o) => o.projects?.length);
  const proj =
    org?.projects?.find((p: Json) => p.projectName?.includes("默认项目")) ?? org?.projects?.[0];
  if (!org?.organizationId || !proj?.projectId) throw new Error("ZAI_NO_PROJECT");
  const path = `${ZAI}/api/biz/v1/organization/${encodeURIComponent(org.organizationId)}/projects/${encodeURIComponent(proj.projectId)}/api_keys`;
  const keys = await zaiJson(path, { headers: { Authorization: `Bearer ${biz}` }, signal });
  const key =
    (Array.isArray(keys) ? keys.find((k: Json) => k.name === "pospay-coding-plan") : null) ??
    (await zaiJson(path, {
      ...postJson({ name: "pospay-coding-plan", usageScene: 1 }, biz),
      signal,
    }));
  if (!key?.apiKey) throw new Error("ZAI_NO_KEY");
  return { organizationId: org.organizationId, projectId: proj.projectId, apiKeyId: key.apiKey };
}
async function zaiProjectToken(
  oauth: string,
  extras: Json,
  signal: AbortSignal = AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
): Promise<Credential> {
  const login = await zaiJson(`${ZAI}/api/auth/z/login`, { ...postJson({ token: oauth }), signal });
  const biz = login?.access_token || login?.accessToken;
  if (!biz) throw new Error("ZAI_NO_ACCOUNT_TOKEN");
  const loc = extras.location ?? (await zaiLocation(biz, signal));
  const path = `${ZAI}/api/biz/v1/organization/${encodeURIComponent(loc.organizationId)}/projects/${encodeURIComponent(loc.projectId)}/api_keys/${encodeURIComponent(loc.apiKeyId)}/access_tokens`;
  const started = Date.now();
  const tok = await zaiJson(path, {
    ...postJson({ clientType: "pospay", clientVersion: "1.0.0" }, biz),
    signal,
  });
  if (tok?.enable === false) throw new Error("ZAI_TOKENS_DISABLED");
  if (!tok?.accessToken) throw new Error("ZAI_NO_ACCESS_TOKEN");
  const expires = Math.min(
    Number(tok.expiresAt) * 1000 || Infinity,
    started + (Number(tok.expiresIn) || 3600) * 1000,
  );
  return { access: tok.accessToken, refresh: oauth, expires, extras: { ...extras, location: loc } };
}

const REFRESH: Record<Exclude<AccountProvider, "zai_coding">, [string, string]> = {
  codex: [`${OPENAI_AUTH}/oauth/token`, CODEX_CLIENT_ID],
  kimi_coding: [`${KIMI_AUTH}/api/oauth/token`, KIMI_CLIENT_ID],
  minimax_coding: [`${MINIMAX_AUTH}/oauth2/token`, MINIMAX_CLIENT_ID],
};

async function readRefreshResponse(url: string, init: RequestInit) {
  const controller = new AbortController();
  const { signal } = controller;
  const timeOut = () => controller.abort(new DOMException("Provider timed out", "TimeoutError"));
  let timer = setTimeout(timeOut, PROVIDER_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal });
    // The provider may have rotated the token by the time headers arrive.
    // Give the body a separate bounded window to deliver the replacement.
    clearTimeout(timer);
    timer = setTimeout(timeOut, REFRESH_BODY_TIMEOUT_MS);
    return { res, body: await readJson(res, signal) };
  } finally {
    clearTimeout(timer);
  }
}

export async function refreshCredential(p: AccountProvider, c: Credential): Promise<Credential> {
  if (!c.refresh) throw new AuthRejected("EXPIRED");
  if (p === "zai_coding") return zaiProjectToken(c.refresh, c.extras ?? {});
  const [url, client_id] = REFRESH[p];
  const { res, body: j } = await readRefreshResponse(
    url,
    form({ grant_type: "refresh_token", client_id, refresh_token: c.refresh }),
  );
  if (!res.ok) {
    const code = oauthError(j);
    if (
      res.status === 401 ||
      ["invalid_grant", "invalid_token", "refresh_token_expired"].includes(code ?? "")
    )
      throw new AuthRejected("EXPIRED");
    throw new Error(`REFRESH_${res.status}`);
  }
  if (p === "codex") return codexCredential(j ?? {}, c);
  if (p === "kimi_coding")
    return {
      access: j?.access_token,
      refresh: j?.refresh_token ?? c.refresh,
      expires: Date.now() + (Number(j?.expires_in) || 3600) * 1000,
      extras: c.extras,
    };
  if (j?.status !== "success") throw new AuthRejected("EXPIRED");
  return {
    access: j.access_token,
    refresh: j.refresh_token ?? c.refresh,
    expires: Number(j.expired_in),
    extras: c.extras,
  };
}
