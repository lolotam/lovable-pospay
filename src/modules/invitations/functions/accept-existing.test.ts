// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { acceptInviteAsSignedInFn } from "./invitation.functions";
const state = vi.hoisted(() => ({
  session: vi.fn(),
  scope: vi.fn(),
  accept: vi.fn(),
  create: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    inputValidator: (parse: (v: unknown) => unknown) => ({
      handler:
        (fn: (v: unknown) => unknown) =>
        ({ data }: { data: unknown }) =>
          fn({ data: parse(data) }),
    }),
  }),
}));
vi.mock("@tanstack/react-start/server", () => ({ setResponseHeader: vi.fn() }));
vi.mock("@/lib/server/session.server", () => ({ requireSession: state.session }));
vi.mock("@/lib/server/db.server", () => ({
  withUser: async (id: string, run: (db: unknown) => unknown) => {
    state.scope(id);
    return run("scoped-db");
  },
}));
vi.mock("../persistence/invitation.server", () => ({ acceptInvite: state.accept }));
vi.mock("../persistence/account.server", () => ({ createInvitedAccount: state.create }));
beforeEach(() => {
  vi.clearAllMocks();
  state.session.mockResolvedValue({ user: { id: "existing-user", email: "sara@example.test" } });
  state.accept.mockResolvedValue("70000000-0000-4000-8000-000000000001");
});
it("accepts as the session user and email without creating an account", async () => {
  expect(await acceptInviteAsSignedInFn({ data: { token: "a".repeat(43) } })).toEqual({
    companyId: "70000000-0000-4000-8000-000000000001",
  });
  expect(state.scope).toHaveBeenCalledWith("existing-user");
  expect(state.accept).toHaveBeenCalledWith(
    "scoped-db",
    expect.stringMatching(/^[a-f0-9]{64}$/),
    "sara@example.test",
  );
  expect(state.create).not.toHaveBeenCalled();
});
it("requires a session before any company mutation", async () => {
  state.session.mockRejectedValue(new Error("UNAUTHENTICATED"));
  await expect(acceptInviteAsSignedInFn({ data: { token: "a".repeat(43) } })).rejects.toThrow(
    "UNAUTHENTICATED",
  );
  expect(state.accept).not.toHaveBeenCalled();
});
it("propagates email mismatch without account creation", async () => {
  state.accept.mockRejectedValue(new Error("INVITE_EMAIL_MISMATCH"));
  await expect(acceptInviteAsSignedInFn({ data: { token: "a".repeat(43) } })).rejects.toThrow(
    "INVITE_EMAIL_MISMATCH",
  );
  expect(state.create).not.toHaveBeenCalled();
});
