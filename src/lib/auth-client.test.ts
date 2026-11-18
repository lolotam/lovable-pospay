import { expect, it, vi } from "vitest";
import { verifyAuthSession } from "./auth-client";
import { isAuthNotConfigured } from "./auth-errors";

it("requires a fresh session result, and treats an explicit signed-out result as valid", async () => {
  const request = vi.spyOn(globalThis, "fetch");
  try {
    request
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null))
      .mockResolvedValueOnce(Response.json({}))
      .mockResolvedValueOnce(Response.json(null))
      .mockResolvedValueOnce(
        Response.json({ user: { id: "owner" }, session: { id: "session", userId: "owner" } }),
      );
    await expect(verifyAuthSession()).rejects.toThrow("SESSION_VERIFICATION_FAILED");
    await expect(verifyAuthSession()).rejects.toThrow("SESSION_VERIFICATION_FAILED");
    await expect(verifyAuthSession()).rejects.toThrow("SESSION_VERIFICATION_FAILED");
    await expect(verifyAuthSession()).resolves.toBeNull();
    await expect(verifyAuthSession()).resolves.toBe("owner");
    expect(request).toHaveBeenLastCalledWith("/api/auth/get-session?disableCookieCache=true", {
      cache: "no-store",
    });
  } finally {
    request.mockRestore();
  }
});

it("recognizes an auth configuration code on an Error and treats a generic 503 as transient", () => {
  const missingConfig = Object.assign(new Error("Unavailable"), { code: "AUTH_NOT_CONFIGURED" });
  expect(isAuthNotConfigured(missingConfig)).toBe(true);
  expect(isAuthNotConfigured({ status: 503 })).toBe(false);
});
