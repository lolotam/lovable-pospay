// @vitest-environment node
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it, describe, vi } from "vitest";
import pg from "pg";
import { bindPhone } from "./phone.server";
import { withUser } from "@/lib/server/db.server";
import { getAuth } from "@/lib/server/auth.server";
import { unbindPhoneFn } from "../functions/phone.functions";
import { assertBoundPhonePasskey } from "@/lib/server/phone-passkey.server";
const identity = vi.hoisted(() => ({ userId: "c2-staff" }));
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
vi.mock("@/lib/server/session.server", () => ({ requireUserId: async () => identity.userId }));
vi.mock("@tanstack/react-start/server", () => ({ getCookie: () => undefined, setCookie: vi.fn() }));
const url = process.env["POSPAY_TEST_DATABASE_URL"];
const company = "82000000-0000-4000-8000-000000000001";
const branch = "82000000-0000-4000-8000-000000000002";
describe.skipIf(!url)("C2 real bind/unbind adapter deletion", () => {
  let admin: pg.Pool;
  beforeAll(async () => {
    if (!url || new URL(url).hostname !== "127.0.0.1" || new URL(url).pathname !== "/pospay_test")
      throw new Error("Disposable localhost pospay_test required");
    vi.stubEnv("DATABASE_URL", url);
    vi.stubEnv("BETTER_AUTH_SECRET", "test-only-c2-passkey-secret-at-least-32");
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:8080");
    admin = new pg.Pool({ connectionString: url });
    // The suite shares one database and earlier files may re-apply older
    // migrations, so re-assert the late self-unbind policy this file needs.
    await admin.query(await readFile("db/migrations/0021_phone_self_unbind.sql", "utf8"));
    await admin.query("insert into companies(id,name) values($1,'C2 salon')", [company]);
    await admin.query("insert into branches(id,company_id,name) values($1,$2,'C2 branch')", [
      branch,
      company,
    ]);
    await admin.query(
      `insert into "user"(id,email,name,"emailVerified") values ('c2-owner','c2-owner@example.test','Owner',true),('c2-staff','c2-staff@example.test','Staff',true)`,
    );
    await admin.query(
      "insert into memberships(company_id,user_id,role,branch_id) values($1,'c2-owner','owner',null),($1,'c2-staff','staff',$2)",
      [company, branch],
    );
    await admin.query(
      "insert into staff_members(company_id,branch_id,user_id,display_name) values($1,$2,'c2-staff','Staff')",
      [company, branch],
    );
  });
  afterAll(async () => {
    if (admin) {
      await admin.query("delete from companies where id=$1", [company]);
      await admin.query(`delete from "user" where id in ('c2-owner','c2-staff')`);
      await admin.end();
    }
    vi.unstubAllEnvs();
  });
  it("signs in only a bound passkey of a current member", async () => {
    const ctx = await getAuth().$context;
    for (const credentialID of ["c2-gate", "c2-unbound"])
      await ctx.adapter.create({
        model: "passkey",
        data: {
          name: "Phone",
          userId: "c2-staff",
          credentialID,
          publicKey: "test-key",
          counter: 0,
          deviceType: "singleDevice",
          backedUp: false,
        },
      });
    await withUser("c2-staff", (db) =>
      bindPhone(db, "c2-staff", company, "c2-gate", "c2-gate-session"),
    );
    try {
      await expect(assertBoundPhonePasskey("c2-gate")).resolves.toBeUndefined();
      await expect(assertBoundPhonePasskey("c2-unbound")).rejects.toThrow("Authentication failed");
      await admin.query("delete from memberships where company_id=$1 and user_id='c2-staff'", [
        company,
      ]);
      await expect(assertBoundPhonePasskey("c2-gate")).rejects.toThrow("Authentication failed");
    } finally {
      await admin.query(
        "insert into memberships(company_id,user_id,role,branch_id) values($1,'c2-staff','staff',$2) on conflict do nothing",
        [company, branch],
      );
      await admin.query("delete from phone_bindings where company_id=$1", [company]);
      await ctx.adapter.deleteMany({
        model: "passkey",
        where: [{ field: "userId", value: "c2-staff" }],
      });
    }
  });
  it.each(["c2-staff", "c2-owner"])("%s unbind deletes the bound passkey", async (actor) => {
    identity.userId = actor;
    const ctx = await getAuth().$context;
    await ctx.adapter.create({
      model: "passkey",
      data: {
        name: "Phone",
        userId: "c2-staff",
        credentialID: "c2-credential",
        publicKey: "test-key",
        counter: 0,
        deviceType: "singleDevice",
        backedUp: false,
      },
    });
    await withUser("c2-staff", (db) =>
      bindPhone(db, "c2-staff", company, "c2-credential", "c2-test-session"),
    );
    await unbindPhoneFn({ data: { companyId: company, userId: "c2-staff" } });
    expect(
      await ctx.adapter.findOne({
        model: "passkey",
        where: [{ field: "credentialID", value: "c2-credential" }],
      }),
    ).toBeNull();
    expect(
      (await admin.query("select id from phone_bindings where company_id=$1", [company])).rows,
    ).toHaveLength(0);
  });
});
