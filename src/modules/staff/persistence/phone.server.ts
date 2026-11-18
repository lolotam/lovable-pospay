import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type pg from "pg";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { getAuth } from "@/lib/server/auth.server";
import type { PhoneProofInput } from "../phone.contracts";

const cookieName = "pospay-phone";
async function hash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, "0")).join("");
}
export async function getPhoneDeviceHash(): Promise<string | null> {
  const token = getCookie(cookieName);
  return token ? hash(token) : null;
}

async function firstDeviceToken(sessionId: string): Promise<string> {
  const secret = process.env["BETTER_AUTH_SECRET"];
  if (!secret) throw new Error("AUTH_NOT_CONFIGURED");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const token = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`pospay-phone-v1:${sessionId}`),
  );
  return Buffer.from(token).toString("hex");
}
function origin() {
  const value = process.env["BETTER_AUTH_URL"];
  if (!value) throw new Error("AUTH_NOT_CONFIGURED");
  return new URL(value).origin;
}
export async function challenge(
  db: pg.PoolClient,
  userId: string,
  companyId: string,
  purpose: "bind" | "scan",
) {
  const { rows } = await db.query("select public.my_staff_id($1) as staff", [companyId]);
  if (!rows[0]?.staff) throw new Error("FORBIDDEN");
  const options = await generateAuthenticationOptions({
    rpID: new URL(origin()).hostname,
    userVerification: "required",
  });
  const result = await db.query(
    `insert into public.phone_challenges (company_id,user_id,challenge,purpose,expires_at)
    values ($1,$2,$3,$4,now()+interval '2 minutes') returning id`,
    [companyId, userId, options.challenge, purpose],
  );
  return { options, challengeId: result.rows[0].id as string };
}
export async function prove(
  db: pg.PoolClient,
  userId: string,
  data: PhoneProofInput,
  purpose: "bind" | "scan",
) {
  const taken = await db.query(
    `delete from public.phone_challenges where company_id=$1 and id=$2
    and user_id=$3 and purpose=$4 and expires_at>now() returning challenge`,
    [data.companyId, data.challengeId, userId, purpose],
  );
  if (!taken.rows[0]) throw new Error("INVALID_PROOF");
  const ctx = await getAuth().$context;
  const key = await ctx.adapter.findOne<{
    userId: string;
    credentialID: string;
    publicKey: string;
    counter: number;
  }>({
    model: "passkey",
    where: [{ field: "credentialID", value: data.response.id }],
  });
  if (!key || key.userId !== userId) throw new Error("FORBIDDEN");
  const { authenticatorAttachment, response, ...credentialResponse } = data.response;
  const { userHandle, ...assertion } = response;
  const result = await verifyAuthenticationResponse({
    response: {
      ...credentialResponse,
      response: { ...assertion, ...(userHandle === undefined ? {} : { userHandle }) },
      ...(authenticatorAttachment === undefined ? {} : { authenticatorAttachment }),
    },
    expectedChallenge: taken.rows[0].challenge,
    expectedOrigin: origin(),
    expectedRPID: new URL(origin()).hostname,
    credential: {
      id: key.credentialID,
      publicKey: Buffer.from(key.publicKey, "base64"),
      counter: key.counter,
    },
    requireUserVerification: true,
  });
  if (!result.verified) throw new Error("INVALID_PROOF");
  await ctx.adapter.update({
    model: "passkey",
    where: [{ field: "credentialID", value: key.credentialID }],
    update: { counter: result.authenticationInfo.newCounter },
  });
  return key.credentialID;
}
export async function bindPhone(
  db: pg.PoolClient,
  userId: string,
  companyId: string,
  credentialId: string,
  sessionId: string,
) {
  const existing = getCookie(cookieName);
  // Concurrent first binds in one signed-in session must hit the same unique hash.
  const token = existing ?? (await firstDeviceToken(sessionId));
  await db.query(
    `insert into public.phone_bindings (company_id,user_id,credential_id,device_hash) values ($1,$2,$3,$4)`,
    [companyId, userId, credentialId, await hash(token)],
  );
  await db.query(
    `insert into public.audit_log (company_id,actor_user_id,action,entity_id) values ($1,$2,'phone.bound',$2)`,
    [companyId, userId],
  );
  setCookie(cookieName, token, {
    httpOnly: true,
    secure: origin().startsWith("https:"),
    sameSite: "strict",
    path: "/",
    maxAge: 31536000,
  });
}
export async function requirePhone(
  db: pg.PoolClient,
  userId: string,
  companyId: string,
  credentialId: string,
) {
  const deviceHash = await getPhoneDeviceHash();
  if (!deviceHash) throw new Error("PHONE_NOT_BOUND");
  const { rows } = await db.query(
    `select id from public.phone_bindings where company_id=$1 and user_id=$2
    and credential_id=$3 and device_hash=$4 for update`,
    [companyId, userId, credentialId, deviceHash],
  );
  const denied = await db.query(
    `select 1 from public.permission_overrides where company_id=$1 and user_id=$2
    and permission='attendance.record' and effect='deny'`,
    [companyId, userId],
  );
  if (!rows[0] || denied.rows[0]) throw new Error("PHONE_NOT_BOUND");
}
