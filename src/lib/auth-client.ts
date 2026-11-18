import { createAuthClient } from "better-auth/react";
import { twoFactorClient, phoneNumberClient, emailOTPClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";
import { z } from "zod";

export const authClient = createAuthClient({
  plugins: [twoFactorClient(), phoneNumberClient(), passkeyClient(), emailOTPClient()],
});

const verifiedSession = z
  .object({
    user: z.object({ id: z.string().min(1) }),
    session: z.object({ id: z.string().min(1), userId: z.string().min(1) }),
  })
  .refine(({ user, session }) => user.id === session.userId)
  .nullable();

export async function verifyAuthSession() {
  const result = await fetch("/api/auth/get-session?disableCookieCache=true", {
    cache: "no-store",
  });
  const parsed = verifiedSession.safeParse(
    result.ok ? await result.json().catch(() => undefined) : undefined,
  );
  if (!parsed.success) throw new Error("SESSION_VERIFICATION_FAILED");
  return parsed.data?.user.id ?? null;
}
