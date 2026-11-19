// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { acceptInviteAsSignedInFn } from "../functions/invitation.functions";
import { hashInviteToken } from "../domain/invite-token";
const session = vi.hoisted(() => ({ email: "c3-existing@example.test" }));
vi.mock("@tanstack/react-start", () => ({
  createServerOnlyFn: (fn: unknown) => fn,
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
vi.mock("@/lib/server/session.server", () => ({
  requireSession: async () => ({ user: { id: "c3-existing", email: session.email } }),
}));
vi.mock("@tanstack/react-start/server", () => ({ setResponseHeader: vi.fn() }));
const url = process.env["POSPAY_TEST_DATABASE_URL"];
const company = "83000000-0000-4000-8000-000000000001";
const token = "c".repeat(43);
describe.skipIf(!url)("C3 existing account membership without user creation", () => {
  let admin: pg.Pool;
  beforeAll(async () => {
    if (!url || new URL(url).hostname !== "127.0.0.1" || new URL(url).pathname !== "/pospay_test")
      throw new Error("Disposable localhost pospay_test required");
    vi.stubEnv("DATABASE_URL", url);
    admin = new pg.Pool({ connectionString: url });
    await admin.query("insert into companies(id,name) values($1,'C3 salon')", [company]);
    await admin.query(
      `insert into "user"(id,email,name,"emailVerified") values('c3-existing','c3-existing@example.test','Existing',true)`,
    );
    await admin.query(
      "insert into invitations(company_id,email,role,token_hash,expires_at,invited_by) values($1,'c3-existing@example.test','staff',$2,now()+interval '1 day','c3-owner')",
      [company, await hashInviteToken(token)],
    );
  });
  afterAll(async () => {
    if (admin) {
      await admin.query("delete from companies where id=$1", [company]);
      await admin.query(`delete from "user" where id='c3-existing'`);
      await admin.end();
    }
    vi.unstubAllEnvs();
  });
  it("refuses mismatch without adding a membership", async () => {
    session.email = "wrong@example.test";
    await expect(acceptInviteAsSignedInFn({ data: { token } })).rejects.toThrow(
      "INVITE_EMAIL_MISMATCH",
    );
    expect(
      (await admin.query("select role from memberships where company_id=$1", [company])).rows,
    ).toHaveLength(0);
  });
  it("joins with exactly one membership and no additional user", async () => {
    session.email = "c3-existing@example.test";
    const before = (await admin.query(`select count(*)::int as count from "user"`)).rows[0].count;
    expect(await acceptInviteAsSignedInFn({ data: { token } })).toEqual({ companyId: company });
    expect(
      (await admin.query("select user_id,role from memberships where company_id=$1", [company]))
        .rows,
    ).toEqual([{ user_id: "c3-existing", role: "staff" }]);
    expect((await admin.query(`select count(*)::int as count from "user"`)).rows[0].count).toBe(
      before,
    );
  });
});
