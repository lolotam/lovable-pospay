import { emailOTP, twoFactor } from "better-auth/plugins";
import { createAuthEndpoint, createAuthMiddleware, APIError } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { constantTimeEqual } from "better-auth/crypto";
import { revokeUnprovenAccountAccess } from "better-auth/db";
import { z } from "zod";

type OtpSender = Parameters<typeof emailOTP>[0]["sendVerificationOTP"];

/** يجمع استعادة البريد مع حماية الإدارة دون إنشاء مخزن رموز موازٍ. */
export function recoveryPlugins(sender: OtpSender) {
  const otp = emailOTP({
    sendVerificationOTP: sender,
    otpLength: 6,
    expiresIn: 300,
    allowedAttempts: 3,
    storeOTP: "hashed",
    disableSignUp: true,
  });
  const secondFactor = twoFactor({ issuer: "PosPay" });
  const guarded = secondFactor.hooks.after.map((hook) => ({
    matcher: (ctx: Parameters<typeof hook.matcher>[0]) =>
      hook.matcher(ctx) ||
      ctx.path === "/sign-in/email-otp" ||
      ctx.path?.startsWith("/callback/") === true,
    handler: createAuthMiddleware(async (ctx) => {
      const original = ctx.path;
      ctx.path = "/sign-in/email";
      try {
        const result: unknown = await hook.handler({ ...ctx, returnHeaders: true });
        const response =
          result && typeof result === "object" && "response" in result ? result.response : result;
        if (
          result &&
          typeof result === "object" &&
          "headers" in result &&
          result.headers instanceof Headers
        ) {
          for (const cookie of result.headers.getSetCookie()) {
            ctx.responseHeaders.append("set-cookie", cookie);
          }
        }
        if (
          original?.startsWith("/callback/") &&
          response &&
          typeof response === "object" &&
          "twoFactorRedirect" in response
        ) {
          throw ctx.redirect(`${new URL(ctx.context.baseURL).origin}/sign-in?twoFactor=true`);
        }
        return response;
      } finally {
        ctx.path = original;
      }
    }),
  }));
  const signIn = createAuthEndpoint(
    "/sign-in/email-otp",
    {
      method: "POST",
      body: z.object({ email: z.email(), otp: z.string().regex(/^\d{6}$/) }),
    },
    async (ctx) => {
      const email = ctx.body.email.toLowerCase();
      const record = await ctx.context.internalAdapter.consumeVerificationValue(
        `forget-password-otp-${email}`,
      );
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ctx.body.otp));
      const expected = btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replaceAll("=", "");
      if (!record || record.expiresAt <= new Date())
        throw new APIError("BAD_REQUEST", { code: "INVALID_OTP", message: "Invalid OTP" });
      const [hash, count] = record.value.split(":");
      const attempts = Number(count || 0);
      if (attempts >= 3)
        throw new APIError("FORBIDDEN", {
          code: "TOO_MANY_ATTEMPTS",
          message: "Too many attempts",
        });
      if (!hash || !constantTimeEqual(hash, expected)) {
        await ctx.context.internalAdapter.createVerificationValue({
          identifier: `forget-password-otp-${email}`,
          value: `${hash}:${attempts + 1}`,
          expiresAt: record.expiresAt,
        });
        throw new APIError("BAD_REQUEST", { code: "INVALID_OTP", message: "Invalid OTP" });
      }
      const found = await ctx.context.internalAdapter.findUserByEmail(email);
      if (!found)
        throw new APIError("BAD_REQUEST", { code: "INVALID_OTP", message: "Invalid OTP" });
      // Upstream cleanup prevents a mailbox owner inheriting access planted before verification.
      const user = found.user.emailVerified
        ? found.user
        : await revokeUnprovenAccountAccess(ctx, found.user.id);
      if (!user) throw new APIError("BAD_REQUEST", { code: "INVALID_OTP", message: "Invalid OTP" });
      const session = await ctx.context.internalAdapter.createSession(user.id);
      if (!session)
        throw new APIError("INTERNAL_SERVER_ERROR", { message: "Session creation failed" });
      await setSessionCookie(ctx, { session, user });
      return ctx.json({ token: session.token, user });
    },
  );
  return [
    { ...otp, endpoints: { ...otp.endpoints, signInEmailOTP: signIn } },
    { ...secondFactor, hooks: { after: guarded } },
  ];
}
