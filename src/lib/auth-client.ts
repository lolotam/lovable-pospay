import { createAuthClient } from "better-auth/react";
import { twoFactorClient, phoneNumberClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";

export const authClient = createAuthClient({
  plugins: [twoFactorClient(), phoneNumberClient(), passkeyClient()],
});
