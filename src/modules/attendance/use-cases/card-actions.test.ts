import { describe, it, expect } from "vitest";
import { issueCardUseCase, revokeCardUseCase } from "./card-actions";
import type { CardRepository } from "../ports/card-repository";

function fake(
  over: Partial<{
    manager: boolean;
    approved: boolean;
    phone: boolean;
    card: boolean;
    revoked: boolean;
  }> = {},
) {
  const s = { manager: true, approved: true, phone: false, card: false, revoked: false, ...over };
  const inserted: string[] = [];
  const audits: string[] = [];
  const repo: CardRepository = {
    lockStaff: async (id) => ({ id, name: "Sara", userId: "u1", manager: s.manager }),
    eligibility: async () => ({ approved: s.approved, phone: s.phone, card: s.card }),
    insertCard: async (_id, h) => (inserted.push(h), "card-1"),
    cardStaff: async (id) => (id === "card-1" ? "staff-1" : null),
    markRevoked: async () => !s.revoked,
    audit: async (a) => void audits.push(a),
  };
  return { repo, inserted, audits };
}
const tokens = { generate: () => "tok", hash: async (t: string) => `h:${t}` };

describe("card actions use-case", () => {
  it("issues a hashed card and audits it for an approved manager", async () => {
    const f = fake();
    const out = await issueCardUseCase(f.repo, tokens, "staff-1");
    expect(out).toEqual({ token: "tok", name: "Sara", cardId: "card-1" });
    expect(f.inserted).toEqual(["h:tok"]);
    expect(f.audits).toEqual(["cards.issued"]);
  });
  it("refuses a card while a phone is bound", async () => {
    const f = fake({ phone: true });
    await expect(issueCardUseCase(f.repo, tokens, "staff-1")).rejects.toThrow("ACTIVE_PHONE");
    expect(f.inserted).toEqual([]);
  });
  it("refuses revocation by a non-manager", async () => {
    await expect(revokeCardUseCase(fake({ manager: false }).repo, "card-1")).rejects.toThrow(
      "FORBIDDEN",
    );
  });
  it("reports an already revoked card", async () => {
    await expect(revokeCardUseCase(fake({ revoked: true }).repo, "card-1")).rejects.toThrow(
      "CARD_REVOKED",
    );
  });
  it("rejects an unknown card", async () => {
    await expect(revokeCardUseCase(fake().repo, "x")).rejects.toThrow("FORBIDDEN");
  });
});
