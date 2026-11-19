// Better Auth instance (server-only). Admins: email+password with TOTP (twoFactor).
// Staff: phone OTP over WhatsApp (D-16) and a Passkey bound to one phone (D-40).
import { betterAuth } from "better-auth";
import { phoneNumber } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { getAuthPool } from "./db.server";
import { sendWhatsAppOtp } from "./whatsapp.server";
import { passwordRecoveryOptions } from "./password-recovery.server";
import { getResendPasswordSender, getResendOtpSender } from "./resend.server";
import { recoveryPlugins } from "./email-recovery.server";

function createAuth() {
  const baseURL = process.env["BETTER_AUTH_URL"];
  const googleClientId = process.env["GOOGLE_CLIENT_ID"];
  const googleClientSecret = process.env["GOOGLE_CLIENT_SECRET"];
  return betterAuth({
    appName: "PosPay",
    baseURL,
    secret: process.env["BETTER_AUTH_SECRET"],
    database: getAuthPool(),
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ["google"],
        requireLocalEmailVerified: true,
      },
    },
    socialProviders:
      googleClientId && googleClientSecret
        ? {
            google: {
              clientId: googleClientId,
              clientSecret: googleClientSecret,
              disableSignUp: true,
            },
          }
        : {},
    emailAndPassword: passwordRecoveryOptions(getResendPasswordSender()),
    rateLimit: {
      enabled: true,
      customRules: {
        "/request-password-reset": { window: 60, max: 3 },
        "/reset-password": { window: 60, max: 5 },
        "/email-otp/send-verification-otp": { window: 60, max: 3 },
        "/email-otp/check-verification-otp": { window: 60, max: 5 },
        "/email-otp/reset-password": { window: 60, max: 5 },
        "/sign-in/email-otp": { window: 60, max: 5 },
      },
    },
    plugins: [
      ...recoveryPlugins(getResendOtpSender()),
      phoneNumber({
        sendOTP: async ({ phoneNumber: phone, code }) => sendWhatsAppOtp(phone, code),
      }),
      passkey({
        rpName: "PosPay",
        rpID: baseURL ? new URL(baseURL).hostname : "localhost",
        origin: baseURL,
        authentication: {
          afterVerification: async ({ clientData }) => {
            const { assertBoundPhonePasskey } = await import("./phone-passkey.server");
            await assertBoundPhonePasskey(clientData.id);
          },
        },
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
