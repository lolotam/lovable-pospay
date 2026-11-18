// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import type pg from "pg";
const state = vi.hoisted(() => ({ cookie: undefined as string | undefined, owned: true }));
vi.mock("@tanstack/react-start/server", () => ({
  getCookie: () => state.cookie,
  setCookie: vi.fn(),
}));
vi.mock("@/lib/server/auth.server", () => ({
  getAuth: () => ({
    $context: Promise.resolve({
      adapter: {
        findOne: async () => ({
          userId: state.owned ? "staff-a" : "staff-b",
          credentialID: "credential",
          publicKey: "AA==",
          counter: 0,
        }),
      },
    }),
  }),
}));
import { requirePhone, prove } from "./phone.server";

describe("phone ownership security", () => {
  beforeEach(() => {
    state.cookie = undefined;
    state.owned = true;
  });
  it("rejects a synchronized passkey on a phone without the bound cookie", async () => {
    const query = vi.fn();
    await expect(
      requirePhone({ query } as unknown as pg.PoolClient, "staff-a", "company", "credential"),
    ).rejects.toThrow("PHONE_NOT_BOUND");
    expect(query).not.toHaveBeenCalled();
  });
  it("rejects the old phone after manager unbinding", async () => {
    state.cookie = "old-device";
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await expect(
      requirePhone({ query } as unknown as pg.PoolClient, "staff-a", "company", "credential"),
    ).rejects.toThrow("PHONE_NOT_BOUND");
    expect(query.mock.calls[0]?.[1]?.slice(0, 3)).toEqual(["company", "staff-a", "credential"]);
  });
  it("deny override rejects an otherwise matching phone", async () => {
    state.cookie = "device";
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "binding" }] })
      .mockResolvedValueOnce({ rows: [{ deny: true }] });
    await expect(
      requirePhone({ query } as unknown as pg.PoolClient, "staff-a", "company", "credential"),
    ).rejects.toThrow("PHONE_NOT_BOUND");
  });
  it("rejects another staff member's passkey before signature verification", async () => {
    state.owned = false;
    const query = vi.fn().mockResolvedValue({ rows: [{ challenge: "challenge" }] });
    await expect(
      prove(
        { query } as unknown as pg.PoolClient,
        "staff-a",
        {
          companyId: "company",
          challengeId: "id",
          response: {
            id: "credential",
            rawId: "credential",
            type: "public-key",
            response: { clientDataJSON: "", authenticatorData: "", signature: "", userHandle: "" },
            clientExtensionResults: {},
            authenticatorAttachment: "platform",
          },
        },
        "scan",
      ),
    ).rejects.toThrow("FORBIDDEN");
  });
  it("rejects expired or already consumed challenges", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await expect(
      prove(
        { query } as unknown as pg.PoolClient,
        "staff-a",
        {
          companyId: "company",
          challengeId: "id",
          response: {
            id: "credential",
            rawId: "credential",
            type: "public-key",
            response: { clientDataJSON: "", authenticatorData: "", signature: "", userHandle: "" },
            clientExtensionResults: {},
            authenticatorAttachment: "platform",
          },
        },
        "scan",
      ),
    ).rejects.toThrow("INVALID_PROOF");
  });
});
