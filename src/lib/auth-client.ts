import { createAuthClient } from "better-auth/react";
import { twoFactorClient, phoneNumberClient, emailOTPClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";

export const authClient = createAuthClient({
  plugins: [twoFactorClient(), phoneNumberClient(), passkeyClient(), emailOTPClient()],
});

export async function verifyAuthSession() {
  const result = await authClient.getSession({ query: { disableCookieCache: true } });
  if (!result || result.error || result.data === undefined)
    throw new Error("SESSION_VERIFICATION_FAILED");
}
