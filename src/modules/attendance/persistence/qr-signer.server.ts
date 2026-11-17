import type pg from "pg";
import type { Signer } from "../domain/qr-token";

export async function branchSigner(db: pg.PoolClient, branchId: string): Promise<Signer | null> {
  const { rows } = await db.query(`select public.branch_qr_secret($1) as secret`, [branchId]);
  const secret: string | null = rows[0]?.secret ?? null;
  if (!secret) return null;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return async (message) => {
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
    return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
  };
}
