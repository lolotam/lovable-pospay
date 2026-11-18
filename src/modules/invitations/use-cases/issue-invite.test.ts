import { describe, expect, it } from "vitest";
import { issueInvite } from "./issue-invite";

const url = "https://app.example.test/invite?t=secret-token";
function deps(send: () => Promise<boolean>) {
  const revoked: string[] = [];
  return {
    revoked,
    save: async () => ({ id: "invite-1", companyName: "Salon" }),
    revoke: async (id: string) => void revoked.push(id),
    send,
  };
}

describe("issueInvite", () => {
  it("never hands the invitation link back to the inviter", async () => {
    const d = deps(async () => true);
    const result = await issueInvite(d, url);
    expect(result).toEqual({ emailed: true });
    expect(JSON.stringify(result)).not.toContain("secret-token");
    expect(d.revoked).toEqual([]);
  });
  it.each([
    ["the sender reports no delivery", async () => false],
    [
      "the sender fails",
      async () => {
        throw new Error("timeout");
      },
    ],
  ])("revokes the invitation when %s", async (_case, send) => {
    const d = deps(send);
    await expect(issueInvite(d, url)).rejects.toThrow("INVITE_EMAIL_NOT_SENT");
    expect(d.revoked).toEqual(["invite-1"]);
  });
});
