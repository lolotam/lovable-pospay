/** صلاحية الدعوة بالأيام قبل أن تنتهي ويُطلب إصدار دعوة جديدة. */
export const INVITE_TTL_DAYS = 7;

/** يولّد رمز دعوة عشوائياً (32 بايت) بصيغة base64url. */
export function newInviteToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** بصمة SHA-256 للرمز؛ تُحفظ البصمة فقط وليس الرمز. */
export async function hashInviteToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** وقت انتهاء الدعوة من لحظة الإصدار. */
export function inviteExpiry(now: Date): Date {
  return new Date(now.getTime() + INVITE_TTL_DAYS * 86_400_000);
}
