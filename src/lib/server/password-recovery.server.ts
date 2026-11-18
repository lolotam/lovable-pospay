import type { BetterAuthOptions } from "better-auth";

type EmailPasswordOptions = NonNullable<BetterAuthOptions["emailAndPassword"]>;
export type PasswordResetSender = NonNullable<EmailPasswordOptions["sendResetPassword"]>;

/** يترك الإرسال معطلاً حتى ضبط البريد، ويستخدم رموز Better Auth أحادية الاستخدام. */
export function passwordRecoveryOptions(
  sendResetPassword?: PasswordResetSender,
): EmailPasswordOptions {
  return {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    resetPasswordTokenExpiresIn: 3600,
    revokeSessionsOnPasswordReset: true,
    ...(sendResetPassword ? { sendResetPassword } : {}),
  };
}
