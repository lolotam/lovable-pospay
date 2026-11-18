import { expect, it, vi } from "vitest";
import { verifyAuthSession } from "./auth-client";
import { isAuthNotConfigured } from "./auth-errors";

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("better-auth/react", () => ({ createAuthClient: () => ({ getSession }) }));

it("requires a fresh session result, and treats an explicit signed-out result as valid", async () => {
  getSession
    .mockResolvedValueOnce({ data: null, error: { status: 503 } })
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce({ data: null, error: null });
  await expect(verifyAuthSession()).rejects.toThrow("SESSION_VERIFICATION_FAILED");
  await expect(verifyAuthSession()).rejects.toThrow("SESSION_VERIFICATION_FAILED");
  await expect(verifyAuthSession()).resolves.toBeUndefined();
  expect(getSession).toHaveBeenLastCalledWith({ query: { disableCookieCache: true } });
});

it("recognizes an auth configuration code on an Error and treats a generic 503 as transient", () => {
  const missingConfig = Object.assign(new Error("Unavailable"), { code: "AUTH_NOT_CONFIGURED" });
  expect(isAuthNotConfigured(missingConfig)).toBe(true);
  expect(isAuthNotConfigured({ status: 503 })).toBe(false);
});
