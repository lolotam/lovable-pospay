// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { hashInviteToken, newInviteToken } from "../domain/invite-token";

const url = process.env["POSPAY_TEST_DATABASE_URL"];
const company = "50000000-0000-0000-0000-000000000001";
describe.skipIf(!url)("invite-only account creation", () => {
  let admin: pg.Pool;
  const token = newInviteToken();
  const email = `inv-${Date.now()}@x.test`;
  beforeAll(async () => {
    if (!url || new URL(url).hostname !== "127.0.0.1" || new URL(url).pathname !== "/pospay_test")
      throw new Error("Disposable database required");
    vi.stubEnv("DATABASE_URL", url);
    vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-test-secret-test-secret-42");
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    admin = new pg.Pool({ connectionString: url });
    await admin.query(`insert into companies(id,name) values($1,'Invite salon') on conflict do nothing`, [company]);
    await admin.query(
      `insert into invitations(company_id,email,role,token_hash,expires_at,invited_by) values($1,$2,'reception',$3,now()+interval '1 day','owner-x')`,
      [company, email, await hashInviteToken(token)],
    );
  });
  afterAll(async () => {
    await admin.query(`delete from memberships where company_id=$1`, [company]);
    await admin.query(`delete from invitations where company_id=$1`, [company]);
    await admin.query(`delete from companies where id=$1`, [company]);
    await admin.query(`delete from "user" where email=$1`, [email]);
    await admin.end();
  });
  it("creates a verified account, joins the company, and the password signs in", async () => {
    const { withUser } = await import("@/lib/server/db.server");
    const { previewInvite, acceptInvite } = await import("./invitation.server");
    const { createInvitedAccount } = await import("./account.server");
    const { getAuth } = await import("@/lib/server/auth.server");
    const hash = await hashInviteToken(token);
    const invite = await withUser("", (db) => previewInvite(db, hash));
    expect(invite).toMatchObject({ email, role: "reception", companyName: "Invite salon" });
    const userId = await createInvitedAccount(email, "Sara", "Strong-pass-1");
    await withUser(userId, (db) => acceptInvite(db, hash, email));
    const m = await admin.query(`select role from memberships where company_id=$1 and user_id=$2`, [company, userId]);
    expect(m.rows).toEqual([{ role: "reception" }]);
    const signed = await getAuth().api.signInEmail({ body: { email, password: "Strong-pass-1" } });
    expect(signed.user.id).toBe(userId);
    await expect(createInvitedAccount(email, "Sara", "Strong-pass-1")).rejects.toThrow("ACCOUNT_EXISTS");
    await expect(withUser("", (db) => previewInvite(db, hash))).resolves.toBeNull();
  });
});
