// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { unbindPhoneFn } from "./phone.functions";
const state = vi.hoisted(() => ({
  query: vi.fn(),
  manager: vi.fn(),
  remove: vi.fn(),
  session: vi.fn(),
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
vi.mock("@/lib/server/session.server", () => ({ requireUserId: state.session }));
vi.mock("@/lib/server/db.server", () => ({
  withUser: async (_id: string, run: (db: unknown) => unknown) => run({ query: state.query }),
}));
vi.mock("../persistence/phone-management.server", () => ({ requireDeviceManager: state.manager }));
vi.mock("@/lib/server/phone-passkey.server", () => ({ deletePhonePasskey: state.remove }));
const data = { companyId: "70000000-0000-4000-8000-000000000001", userId: "mona" };
beforeEach(() => {
  vi.clearAllMocks();
  state.session.mockResolvedValue("owner");
  state.query.mockResolvedValue({ rows: [{ id: "binding", credential_id: "phone-credential" }] });
});
it("authorized unbind removes the matching Better Auth credential", async () => {
  await unbindPhoneFn({ data });
  expect(state.remove).toHaveBeenCalledWith("phone-credential");
});
it("refused unbind never deletes an identity credential", async () => {
  state.manager.mockRejectedValueOnce(new Error("FORBIDDEN"));
  await expect(unbindPhoneFn({ data })).rejects.toThrow("FORBIDDEN");
  expect(state.remove).not.toHaveBeenCalled();
});

it("allows self-unbind without manager authorization", async () => {
  state.session.mockResolvedValue("mona");
  await unbindPhoneFn({ data });
  expect(state.manager).not.toHaveBeenCalled();
  expect(state.remove).toHaveBeenCalledWith("phone-credential");
});
