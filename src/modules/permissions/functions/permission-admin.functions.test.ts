// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listMemberPermissionsFn, saveMemberOverridesFn } from "./permission-admin.functions";
import { toStates } from "../domain/override-states";
const state = vi.hoisted(() => ({
  query: vi.fn(),
  identity: vi.fn(),
  session: vi.fn(),
  header: vi.fn(),
  owner: true,
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    inputValidator: (validate: (v: unknown) => unknown) => ({
      handler:
        (fn: (arg: { data: unknown }) => unknown) =>
        ({ data }: { data: unknown }) =>
          fn({ data: validate(data) }),
    }),
  }),
}));
vi.mock("@tanstack/react-start/server", () => ({ setResponseHeader: state.header }));
vi.mock("@/lib/server/session.server", () => ({ requireUserId: state.session }));
vi.mock("@/lib/server/db.server", () => ({
  withUser: async (id: string, run: (db: unknown) => unknown) => {
    state.identity(id);
    return run({ query: state.query });
  },
}));
const companyId = "70000000-0000-4000-8000-000000000001";
const input = { companyId, userId: "mona", overrides: toStates([]) };
beforeEach(() => {
  vi.clearAllMocks();
  state.owner = true;
  state.session.mockResolvedValue("owner");
  state.query.mockImplementation(async (sql: string) => ({
    rows: sql.includes("has_company_role")
      ? [{ allowed: state.owner }]
      : sql.includes("company_member_directory")
        ? [
            { user_id: "owner", name: "Owner", email: "owner@example.test", roles: ["owner"] },
            { user_id: "mona", name: "Mona", email: "mona@example.test", roles: ["staff"] },
          ]
        : [],
  }));
});
describe("owner permission server boundaries", () => {
  it.each(["list", "save"])("requires an authenticated session for %s", async (action) => {
    state.session.mockRejectedValue(new Error("UNAUTHENTICATED"));
    await expect(
      action === "list"
        ? listMemberPermissionsFn({ data: { companyId } })
        : saveMemberOverridesFn({ data: input }),
    ).rejects.toThrow("UNAUTHENTICATED");
    expect(state.identity).not.toHaveBeenCalled();
  });
  it.each(["list", "save"])(
    "refuses non-owner %s regardless of allow overrides",
    async (action) => {
      state.owner = false;
      await expect(
        action === "list"
          ? listMemberPermissionsFn({ data: { companyId } })
          : saveMemberOverridesFn({ data: input }),
      ).rejects.toThrow("FORBIDDEN");
      expect(
        state.query.mock.calls.some(
          ([sql]) => String(sql).startsWith("delete") || String(sql).startsWith("insert"),
        ),
      ).toBe(false);
    },
  );
  it("validates output and scopes list reads to the real user", async () => {
    const result = await listMemberPermissionsFn({ data: { companyId } });
    expect(result).toHaveLength(2);
    expect(state.identity).toHaveBeenCalledWith("owner");
    expect(state.header).toHaveBeenCalledWith("Cache-Control", "private, no-store");
  });
  it("saves within the user's transaction and records exactly one audit", async () => {
    await saveMemberOverridesFn({
      data: { ...input, overrides: { ...input.overrides, "pos.access": "allow" } },
    });
    expect(state.identity).toHaveBeenCalledWith("owner");
    const audits = state.query.mock.calls.filter(([sql]) =>
      String(sql).includes("insert into public.audit_log"),
    );
    expect(audits).toHaveLength(1);
    expect(audits[0]?.[1]).toEqual([
      companyId,
      "owner",
      "mona",
      JSON.stringify({ before: [], after: [] }),
    ]);
  });
  it("does not accept ownership delegation in the request", async () => {
    await expect(async () =>
      saveMemberOverridesFn({
        data: { ...input, overrides: { ...input.overrides, "permissions.manage": "allow" } },
      }),
    ).rejects.toThrow();
    expect(state.query).not.toHaveBeenCalled();
  });
});
