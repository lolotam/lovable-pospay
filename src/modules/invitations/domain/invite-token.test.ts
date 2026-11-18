import { describe, expect, it } from "vitest";
import { hashInviteToken, inviteExpiry, newInviteToken } from "./invite-token";

describe("invite token", () => {
  it("is random, url-safe and hashed to 64 hex chars", async () => {
    const a = newInviteToken();
    expect(a).not.toBe(newInviteToken());
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await hashInviteToken(a)).toMatch(/^[0-9a-f]{64}$/);
  });
  it("expires after 7 days", () => {
    expect(inviteExpiry(new Date("2026-11-18T00:00:00Z")).toISOString()).toBe("2026-11-25T00:00:00.000Z");
  });
});
