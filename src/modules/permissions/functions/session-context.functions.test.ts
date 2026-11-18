// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSessionContext, selectWorkspace } from "./session-context.functions";
const state = vi.hoisted(() => ({
  cookie: undefined as string | undefined,
  query: vi.fn(),
  identity: vi.fn(),
  session: vi.fn(),
  write: vi.fn(),
  clear: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    handler: (fn: unknown) => fn,
    inputValidator: (validate: (v: unknown) => unknown) => ({
      handler:
        (fn: (arg: { data: unknown }) => unknown) =>
        ({ data }: { data: unknown }) =>
          fn({ data: validate(data) }),
    }),
  }),
}));
vi.mock("@tanstack/react-start/server", () => ({
  getCookie: () => state.cookie,
  setCookie: state.write,
  deleteCookie: state.clear,
  setResponseHeader: vi.fn(),
}));
vi.mock("@/lib/server/session.server", () => ({
  requireSession: state.session,
  requireUserId: async () => (await state.session()).user.id,
}));
vi.mock("@/lib/server/db.server", () => ({
  withUser: async (_id: string, run: (db: unknown) => unknown) => (
    state.identity(_id),
    run({ query: state.query })
  ),
}));
const companyId = "40000000-0000-4000-8000-000000000001";
const ws = {
  kind: "company" as const,
  companyId,
  companyName: "Salon",
  businessType: "salon",
  role: "staff",
  branchId: null,
  branchName: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  state.cookie = undefined;
  state.session.mockResolvedValue({
    user: { id: "mona", name: "Mona", email: "mona@example.test" },
  });
  state.query.mockImplementation(async (sql: string) => ({
    rows: sql.includes("memberships m")
      ? [ws]
      : sql.includes("is_super_admin")
        ? [{ allowed: false }]
        : [],
  }));
});
describe("workspace cookie server boundary", () => {
  it("returns null for absent auth and missing auth configuration only", async () => {
    for (const message of ["UNAUTHENTICATED", "AUTH_NOT_CONFIGURED"]) {
      state.session.mockRejectedValueOnce(new Error(message));
      await expect(getSessionContext()).resolves.toBeNull();
    }
    state.session.mockRejectedValueOnce(new Error("DATABASE_FAILED"));
    await expect(getSessionContext()).rejects.toThrow("DATABASE_FAILED");
  });
  it("uses fresh membership labels rather than cookie content", async () => {
    state.cookie = JSON.stringify({
      kind: "company",
      companyId,
      role: "staff",
      companyName: "Spoofed",
    });
    const result = await getSessionContext();
    expect(result?.active).toMatchObject({ companyName: "Salon" });
    expect(state.clear).not.toHaveBeenCalled();
  });
  it("clears a removed role and returns no active workspace", async () => {
    state.cookie = JSON.stringify({ kind: "company", companyId, role: "owner" });
    expect((await getSessionContext())?.active).toBeNull();
    expect(state.clear).toHaveBeenCalledWith(
      "pospay-ws",
      expect.objectContaining({ path: "/", secure: true, httpOnly: true, sameSite: "lax" }),
    );
  });
  it.each(["not-json", "{}", "null"])("clears malformed cookie %s", async (cookie) => {
    state.cookie = cookie;
    await getSessionContext();
    expect(state.clear).toHaveBeenCalledOnce();
  });
  it.each([
    { kind: "company", companyId, role: "owner" },
    { kind: "company", companyId: "40000000-0000-4000-8000-000000000002", role: "staff" },
    { kind: "platform" },
  ])("refuses unauthorized selection without changing cookies", async (input) => {
    state.cookie = "previous";
    await expect(selectWorkspace({ data: input })).rejects.toThrow("FORBIDDEN");
    expect(state.write).not.toHaveBeenCalled();
    expect(state.clear).not.toHaveBeenCalled();
    expect(state.cookie).toBe("previous");
  });
  it("stores a held workspace with a 180-day secure HttpOnly cookie", async () => {
    const input = { kind: "company" as const, companyId, role: "staff" as const };
    await expect(selectWorkspace({ data: input })).resolves.toEqual(input);
    expect(state.identity).toHaveBeenCalledWith("mona");
    expect(state.write).toHaveBeenCalledWith("pospay-ws", JSON.stringify(input), {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 15552000,
    });
  });
  it("revalidates membership on every read", async () => {
    state.cookie = JSON.stringify({ kind: "company", companyId, role: "staff" });
    expect((await getSessionContext())?.active).not.toBeNull();
    state.query.mockResolvedValue({ rows: [] });
    expect((await getSessionContext())?.active).toBeNull();
    expect(state.clear).toHaveBeenCalledOnce();
  });
});
