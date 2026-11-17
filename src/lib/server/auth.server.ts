// Better Auth instance (server-only). Admins: email+password with TOTP (twoFactor).
// Staff: phone OTP over WhatsApp (D-16) and a Passkey bound to one phone (D-40).
import { betterAuth } from "better-auth";
import { twoFactor, phoneNumber } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { getPool } from "./db.server";
import { sendWhatsAppOtp } from "./whatsapp.server";

function createAuth() {
  const baseURL = process.env["BETTER_AUTH_URL"];
  return betterAuth({
    appName: "PosPay",
    baseURL,
    secret: process.env["BETTER_AUTH_SECRET"],
    database: getPool(),
    emailAndPassword: { enabled: true, disableSignUp: true },
    plugins: [
      twoFactor({ issuer: "PosPay" }),
      phoneNumber({
        sendOTP: async ({ phoneNumber: phone, code }) => sendWhatsAppOtp(phone, code),
      }),
      passkey({
        rpName: "PosPay",
        rpID: baseURL ? new URL(baseURL).hostname : "localhost",
        origin: baseURL,
      }),
      tanstackStartCookies(),
    ],
  });
}

let instance: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  instance ??= createAuth();
  return instance;
}
