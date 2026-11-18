// @vitest-environment node
import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { getPool } from "@/lib/server/db.server";
import { getSessionContext, selectWorkspace } from "./session-context.functions";
const browser = vi.hoisted(() => ({
  cookie: undefined as string | undefined,
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
  getCookie: () => browser.cookie,
  setCookie: browser.write,
  deleteCookie: browser.clear,
  setResponseHeader: vi.fn(),
}));
vi.mock("@/lib/server/session.server", () => ({
  requireUserId: async () => "cookie-user",
  requireSession: async () => ({
    user: { id: "cookie-user", name: "Mona", email: "mona@example.test" },
  }),
}));
const url = process.env["POSPAY_TEST_DATABASE_URL"];
const companyId = "80000000-0000-4000-8000-000000000001",
  foreign = "80000000-0000-4000-8000-000000000002";
describe.skipIf(!url)("workspace cookie validates real memberships on every RPC", () => {
  let admin: pg.Pool;
  beforeAll(async () => {
    if (!url || new URL(url).hostname !== "127.0.0.1" || new URL(url).pathname !== "/pospay_test")
      throw new Error("Disposable localhost pospay_test required");
    vi.stubEnv("DATABASE_URL", url);
    admin = new pg.Pool({ connectionString: url });
    const files = (await readdir("db/migrations")).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
    for (let pass = 0; pass < 2; pass++)
      for (const file of files) await admin.query(await readFile(`db/migrations/${file}`, "utf8"));
    await admin.query(
      `insert into public.companies(id,name) values($1,'Cookie salon'),($2,'Foreign salon')`,
      [companyId, foreign],
    );
    await admin.query(
      `insert into public.memberships(company_id,user_id,role) values($1,'cookie-user','owner'),($2,'cookie-other','owner')`,
      [companyId, foreign],
    );
  });
  afterAll(async () => {
    if (admin) {
      await admin.query("delete from public.companies where id=any($1::uuid[])", [
        [companyId, foreign],
      ]);
      await admin.end();
      await getPool().end();
    }
    vi.unstubAllEnvs();
  });
  it("stores only a database-held workspace after successful selection", async () => {
    const data = { kind: "company" as const, companyId, role: "owner" as const };
    await expect(selectWorkspace({ data })).resolves.toEqual(data);
    expect(browser.write).toHaveBeenCalledWith(
      "pospay-ws",
      JSON.stringify(data),
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        path: "/",
        maxAge: 15552000,
      }),
    );
  });
  it.each([
    { kind: "company", companyId: foreign, role: "owner" },
    { kind: "company", companyId, role: "staff" },
    { kind: "platform" },
  ])("refuses foreign workspace and leaves cookie unchanged", async (data) => {
    browser.write.mockClear();
    browser.clear.mockClear();
    browser.cookie = JSON.stringify({ kind: "company", companyId, role: "owner" });
    const previous = browser.cookie;
    await expect(selectWorkspace({ data })).rejects.toThrow("FORBIDDEN");
    expect(browser.cookie).toBe(previous);
    expect(browser.write).not.toHaveBeenCalled();
    expect(browser.clear).not.toHaveBeenCalled();
  });
  it("clears the stale cookie immediately after membership removal", async () => {
    browser.cookie = JSON.stringify({ kind: "company", companyId, role: "owner" });
    browser.clear.mockClear();
    expect((await getSessionContext())?.active).toMatchObject({ companyId, role: "owner" });
    await admin.query(
      `delete from public.memberships where company_id=$1 and user_id='cookie-user'`,
      [companyId],
    );
    expect((await getSessionContext())?.active).toBeNull();
    expect(browser.clear).toHaveBeenCalledOnce();
  });
});
