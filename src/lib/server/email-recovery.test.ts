// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { symmetricEncrypt } from "better-auth/crypto";
import { passwordRecoveryOptions } from "./password-recovery.server";
import { recoveryPlugins } from "./email-recovery.server";

async function fixture(totpSecret?: string) {
  const mail: string[] = [];
  const auth = betterAuth({
    baseURL: "http://localhost:8080",
    secret: "test-only-email-recovery-secret-at-least-32-chars",
    database: memoryAdapter({
      user: [],
      account: [],
      session: [],
      verification: [],
      twoFactor: [],
    }),
    emailAndPassword: { ...passwordRecoveryOptions(), disableSignUp: false },
    plugins: recoveryPlugins(async ({ otp }) => {
      mail.push(otp);
    }),
    rateLimit: { enabled: false },
    logger: { disabled: true },
  });
  const account = await auth.api.signUpEmail({
    body: { email: "recovery@example.com", name: "Recovery", password: "old-password-123" },
  });
  if (totpSecret) {
    const ctx = await auth.$context;
    await ctx.internalAdapter.updateUser(account.user.id, { twoFactorEnabled: true });
    await ctx.adapter.create({
      model: "twoFactor",
      data: {
        userId: account.user.id,
        secret: await symmetricEncrypt({ key: ctx.secretConfig, data: totpSecret }),
        backupCodes: await symmetricEncrypt({ key: ctx.secretConfig, data: "[]" }),
        verified: true,
      },
    });
  }
  return { auth, mail };
}

describe("Email recovery choice", () => {
  it("changes the password and revokes existing sessions instead of signing in", async () => {
    const { auth, mail } = await fixture();
    const login = await auth.api.signInEmail({
      asResponse: true,
      body: { email: "recovery@example.com", password: "old-password-123" },
    });
    const headers = new Headers({
      cookie: login.headers
        .getSetCookie()
        .map((value) => value.split(";")[0])
        .join("; "),
    });
    await auth.api.sendVerificationOTP({
      body: { email: "recovery@example.com", type: "forget-password" },
    });
    const otp = mail[0];
    if (!otp) throw new Error("Missing test OTP");
    await auth.api.resetPasswordEmailOTP({
      body: { email: "recovery@example.com", otp, password: "new-password-456" },
    });
    expect(await auth.api.getSession({ headers })).toBeNull();
    await expect(
      auth.api.signInEmail({
        body: { email: "recovery@example.com", password: "old-password-123" },
      }),
    ).rejects.toBeDefined();
    expect(
      (
        await auth.api.signInEmail({
          body: { email: "recovery@example.com", password: "new-password-456" },
        })
      ).user.email,
    ).toBe("recovery@example.com");
    await expect(
      auth.api.signInEmailOTP({ body: { email: "recovery@example.com", otp } }),
    ).rejects.toBeDefined();
  });
  it("locks the recovery code after three wrong guesses", async () => {
    const { auth, mail } = await fixture();
    await auth.api.sendVerificationOTP({
      body: { email: "recovery@example.com", type: "forget-password" },
    });
    const otp = mail[0];
    if (!otp) throw new Error("Missing test OTP");
    const wrong = otp === "000000" ? "111111" : "000000";
    for (let attempt = 0; attempt < 3; attempt++)
      await expect(
        auth.api.signInEmailOTP({ body: { email: "recovery@example.com", otp: wrong } }),
      ).rejects.toBeDefined();
    await expect(
      auth.api.resetPasswordEmailOTP({
        body: { email: "recovery@example.com", otp, password: "new-password-456" },
      }),
    ).rejects.toBeDefined();
  });
  it("rejects the code after five minutes", async () => {
    const { auth, mail } = await fixture();
    await auth.api.sendVerificationOTP({
      body: { email: "recovery@example.com", type: "forget-password" },
    });
    const otp = mail[0];
    if (!otp) throw new Error("Missing test OTP");
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(Date.now() + 301000);
      await expect(
        auth.api.signInEmailOTP({ body: { email: "recovery@example.com", otp } }),
      ).rejects.toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });
  it("requires and completes an authenticator challenge after email recovery", async () => {
    const secret = "test-only-authenticator-fixture";
    const { auth, mail } = await fixture(secret);
    await auth.api.sendVerificationOTP({
      body: { email: "recovery@example.com", type: "forget-password" },
    });
    const otp = mail[0];
    if (!otp) throw new Error("Missing test OTP");
    const response = await auth.api.signInEmailOTP({
      asResponse: true,
      body: { email: "recovery@example.com", otp },
    });
    expect(await response.json()).toMatchObject({ twoFactorRedirect: true });
    const headers = new Headers({
      cookie: response.headers
        .getSetCookie()
        .map((value) => value.split(";")[0])
        .join("; "),
    });
    expect(await auth.api.getSession({ headers })).toBeNull();
    const { code } = await auth.api.generateTOTP({ body: { secret } });
    const verified = await auth.api.verifyTOTP({ headers, body: { code } });
    expect(verified.user.email).toBe("recovery@example.com");
  });
  it("allows only one concurrent recovery action", async () => {
    const { auth, mail } = await fixture();
    await auth.api.sendVerificationOTP({
      body: { email: "recovery@example.com", type: "forget-password" },
    });
    const otp = mail[0];
    if (!otp) throw new Error("Missing test OTP");
    const results = await Promise.allSettled([
      auth.api.signInEmailOTP({ body: { email: "recovery@example.com", otp } }),
      auth.api.resetPasswordEmailOTP({
        body: { email: "recovery@example.com", otp, password: "new-password-456" },
      }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  });
  it("never creates an account through email OTP", async () => {
    const { auth, mail } = await fixture();
    await auth.api.sendVerificationOTP({ body: { email: "missing@example.com", type: "sign-in" } });
    expect(mail).toHaveLength(0);
    await expect(
      auth.api.signInEmailOTP({ body: { email: "missing@example.com", otp: "123456" } }),
    ).rejects.toBeDefined();
  });
  it("uses one recovery code for Continue and rejects reuse for changing the password", async () => {
    const { auth, mail } = await fixture();
    await auth.api.sendVerificationOTP({
      body: { email: "recovery@example.com", type: "forget-password" },
    });
    const otp = mail[0];
    if (!otp) throw new Error("Missing test OTP");
    await auth.api.checkVerificationOTP({
      body: { email: "recovery@example.com", otp, type: "forget-password" },
    });
    expect(
      (await auth.api.signInEmailOTP({ body: { email: "recovery@example.com", otp } })).user.email,
    ).toBe("recovery@example.com");
    await expect(
      auth.api.resetPasswordEmailOTP({
        body: { email: "recovery@example.com", otp, password: "new-password-456" },
      }),
    ).rejects.toBeDefined();
  });
  it("sends a six-digit code only for an existing email without disclosing account existence", async () => {
    const { auth, mail } = await fixture();
    const known = await auth.api.sendVerificationOTP({
      body: { email: "recovery@example.com", type: "forget-password" },
    });
    const unknown = await auth.api.sendVerificationOTP({
      body: { email: "missing@example.com", type: "forget-password" },
    });
    expect(known).toEqual(unknown);
    expect(mail).toHaveLength(1);
    expect(mail[0]).toMatch(/^\d{6}$/);
  });
});
