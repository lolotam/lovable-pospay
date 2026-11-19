// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  session: vi.fn(),
  query: vi.fn(),
  cookie: vi.fn(),
  user: vi.fn(),
  header: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    inputValidator: (validator: (input: unknown) => unknown) => ({
      handler: (fn: (arg: { data: unknown }) => unknown) => (arg: { data: unknown }) =>
        fn({ data: validator(arg.data) }),
    }),
    handler: (fn: () => unknown) => () => fn(),
  }),
}));
vi.mock("@tanstack/react-start/server", () => ({ setResponseHeader: state.header }));
vi.mock("@/lib/server/session.server", () => ({ requireSession: state.session }));
vi.mock("@/modules/permissions/index.server", () => ({ readWorkspaceCookie: state.cookie }));
vi.mock("@/lib/server/db.server", () => ({
  withUser: async (id: string, run: (db: unknown) => unknown) => {
    state.user(id);
    return run({ query: state.query });
  },
}));
import {
  getPageDraftFn,
  savePageDraftFn,
  publishPageFn,
  unpublishPageFn,
  getPublicPageFn,
} from "./page.functions";
const companyId = "92000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.clearAllMocks();
  state.session.mockResolvedValue({ user: { id: "owner" } });
  state.cookie.mockReturnValue({ remembered: { kind: "company", companyId, role: "owner" } });
  state.query.mockResolvedValue({ rows: [{ allowed: false }] });
});
const calls = {
  read: () => getPageDraftFn(),
  save: () =>
    savePageDraftFn({ data: { slug: "glow-salon", document: { blocks: [] }, version: 1 } }),
  publish: () => publishPageFn({ data: { version: 1 } }),
  unpublish: () => unpublishPageFn(),
};
it.each(Object.keys(calls) as Array<keyof typeof calls>)(
  "requires session for %s",
  async (action) => {
    state.session.mockRejectedValue(new Error("UNAUTHENTICATED"));
    await expect(calls[action]()).rejects.toThrow("UNAUTHENTICATED");
    expect(state.query).not.toHaveBeenCalled();
  },
);
it.each(Object.keys(calls) as Array<keyof typeof calls>)(
  "rechecks owner in DB for %s despite an owner cookie",
  async (action) => {
    await expect(calls[action]()).rejects.toThrow("FORBIDDEN");
    expect(state.user).toHaveBeenCalledWith("owner");
    expect(state.query).toHaveBeenCalledExactlyOnceWith(
      "select public.has_company_role($1,'owner') as allowed",
      [companyId],
    );
  },
);
it("reads public pages with anonymous identity and no session", async () => {
  state.query.mockResolvedValue({ rows: [{ page: null }] });
  expect(await getPublicPageFn({ data: { slug: "glow-salon" } })).toBeNull();
  expect(state.user).toHaveBeenCalledWith("");
  expect(state.session).not.toHaveBeenCalled();
});
