// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { assertBoundPhonePasskey, deletePhonePasskey } from "./phone-passkey.server";
const state = vi.hoisted(() => ({
  find: vi.fn(),
  remove: vi.fn(),
  query: vi.fn(),
  scope: vi.fn(),
}));
vi.mock("./auth.server", () => ({
  getAuth: () => ({
    $context: Promise.resolve({ adapter: { findOne: state.find, deleteMany: state.remove } }),
  }),
}));
vi.mock("./db.server", () => ({
  withUser: async (id: string, run: (db: unknown) => unknown) => {
    state.scope(id);
    return run({ query: state.query });
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.find.mockResolvedValue({ userId: "mona" });
  state.query.mockResolvedValue({ rows: [{ allowed: true }] });
});
it("accepts a verified credential still bound to a current member", async () => {
  await expect(assertBoundPhonePasskey("phone-credential")).resolves.toBeUndefined();
  expect(state.scope).toHaveBeenCalledWith("mona");
});
it("rejects an unbound credential with generic authentication failure", async () => {
  state.query.mockResolvedValue({ rows: [{ allowed: false }] });
  await expect(assertBoundPhonePasskey("phone-credential")).rejects.toThrow(
    "Authentication failed",
  );
});
it("rejects a missing passkey without looking up account emails", async () => {
  state.find.mockResolvedValue(null);
  await expect(assertBoundPhonePasskey("missing")).rejects.toThrow("Authentication failed");
  expect(state.scope).not.toHaveBeenCalled();
});
it("removes only the unbound credential through the Better Auth adapter", async () => {
  await deletePhonePasskey("phone-credential");
  expect(state.remove).toHaveBeenCalledWith({
    model: "passkey",
    where: [{ field: "credentialID", value: "phone-credential" }],
  });
});
