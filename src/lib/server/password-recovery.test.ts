// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { passwordRecoveryOptions } from "./password-recovery.server";

async function fixture(sender = true) {
  const mail: string[] = [];
  const auth = betterAuth({
    baseURL: "http://localhost:8080",
    secret: "test-only-password-recovery-secret-at-least-32-chars",
    database: memoryAdapter({ user: [], account: [], session: [], verification: [] }),
    emailAndPassword: {
      ...passwordRecoveryOptions(
        sender
          ? async ({ url }) => {
              mail.push(url);
            }
          : undefined,
      ),
      disableSignUp: false,
    },
    rateLimit: { enabled: false },
    advanced: { disableOriginCheck: false, disableCSRFCheck: false },
    logger: { disabled: true },
  });
  await auth.api.signUpEmail({
    body: {
      name: "Recovery test",
      email: "recovery@example.com",
      password: "old-password-123",
    },
  });
  return { auth, mail };
}

describe("Better Auth password recovery API", () => {
  it("does not reveal whether an email exists", async () => {
    const { auth, mail } = await fixture();
    const known = await auth.api.requestPasswordReset({
      body: {
        email: "recovery@example.com",
        redirectTo: "http://localhost:8080/reset-password",
      },
    });
    const unknown = await auth.api.requestPasswordReset({
      body: {
        email: "missing@example.com",
        redirectTo: "http://localhost:8080/reset-password",
      },
    });
    expect(known).toEqual(unknown);
    expect(mail).toHaveLength(1);
  });

  it("changes the password once and revokes existing sessions", async () => {
    const { auth, mail } = await fixture();
    const oldSession = await auth.api.signInEmail({
      asResponse: true,
      body: {
        email: "recovery@example.com",
        password: "old-password-123",
      },
    });
    const cookie = oldSession.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    const headers = new Headers({ cookie });
    expect((await auth.api.getSession({ headers }))?.user.email).toBe("recovery@example.com");
    await auth.api.requestPasswordReset({ body: { email: "recovery@example.com" } });
    const link = mail[0];
    if (!link) throw new Error("Missing reset email");
    const token = new URL(link).pathname.split("/").at(-1);
    if (!token) throw new Error("Missing reset token");
    expect(
      await auth.api.resetPassword({ body: { token, newPassword: "new-password-456" } }),
    ).toEqual({ status: true });
    await expect(
      auth.api.resetPassword({ body: { token, newPassword: "another-password-789" } }),
    ).rejects.toMatchObject({ body: { code: "INVALID_TOKEN" } });
    await expect(
      auth.api.signInEmail({
        body: { email: "recovery@example.com", password: "old-password-123" },
      }),
    ).rejects.toMatchObject({ status: "UNAUTHORIZED" });
    expect(
      (
        await auth.api.signInEmail({
          body: { email: "recovery@example.com", password: "new-password-456" },
        })
      ).user.email,
    ).toBe("recovery@example.com");
    expect(await auth.api.getSession({ headers })).toBeNull();
  });

  it("rejects invalid tokens", async () => {
    const { auth } = await fixture();
    await expect(
      auth.api.resetPassword({ body: { token: "not-issued", newPassword: "new-password-456" } }),
    ).rejects.toMatchObject({ body: { code: "INVALID_TOKEN" } });
  });

  it("rejects sending when no sender is configured", async () => {
    const { auth, mail } = await fixture(false);
    await expect(
      auth.api.requestPasswordReset({ body: { email: "recovery@example.com" } }),
    ).rejects.toMatchObject({ body: { code: "RESET_PASSWORD_DISABLED" } });
    expect(mail).toHaveLength(0);
  });

  it("rejects redirects outside the application origin", async () => {
    const { auth, mail } = await fixture();
    const response = await auth.handler(
      new Request("http://localhost:8080/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "http://localhost:8080" },
        body: JSON.stringify({
          email: "recovery@example.com",
          redirectTo: "https://attacker.invalid/reset-password",
        }),
      }),
    );
    expect(response.status).toBe(403);
    expect(mail).toHaveLength(0);
  });

  it("rejects a reset token after one hour", async () => {
    const { auth, mail } = await fixture();
    await auth.api.requestPasswordReset({ body: { email: "recovery@example.com" } });
    const link = mail[0];
    if (!link) throw new Error("Missing reset email");
    const token = new URL(link).pathname.split("/").at(-1);
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(Date.now() + 3601 * 1000);
      await expect(
        auth.api.resetPassword({ body: { token, newPassword: "new-password-456" } }),
      ).rejects.toMatchObject({ body: { code: "INVALID_TOKEN" } });
    } finally {
      vi.useRealTimers();
    }
  });
});
