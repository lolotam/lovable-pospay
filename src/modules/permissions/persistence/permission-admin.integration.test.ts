// @vitest-environment node
import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { getPool, withUser } from "@/lib/server/db.server";
import { pgPermissionAdminRepository } from "./permission-admin.server";
import { listMemberPermissions } from "../use-cases/list-member-permissions";
import { saveMemberOverrides } from "../use-cases/save-member-overrides";
import { toStates } from "../domain/override-states";

const url = process.env["POSPAY_TEST_DATABASE_URL"];
const a = "80000000-0000-4000-8000-000000000001";
const b = "80000000-0000-4000-8000-000000000002";
const branch = "80000000-0000-4000-8000-000000000003";
const base = { companyId: a, userId: "c1-manager", ...toStates([]) };
describe.skipIf(!url)("C1 real owner permissions under RLS", () => {
  let admin: pg.Pool;
  beforeAll(async () => {
    if (!url || new URL(url).hostname !== "127.0.0.1" || new URL(url).pathname !== "/pospay_test")
      throw new Error("Disposable localhost pospay_test required");
    vi.stubEnv("DATABASE_URL", url);
    admin = new pg.Pool({ connectionString: url });
    const files = (await readdir("db/migrations")).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
    for (let pass = 0; pass < 2; pass++)
      for (const file of files) await admin.query(await readFile(`db/migrations/${file}`, "utf8"));
    await admin.query("insert into public.companies(id,name) values($1,'C1 A'),($2,'C1 B')", [
      a,
      b,
    ]);
    await admin.query("insert into public.branches(id,company_id,name) values($1,$2,'C1 branch')", [
      branch,
      a,
    ]);
    await admin.query(`insert into public."user"(id,email,name,"emailVerified") values
      ('c1-owner','c1-owner@example.test','Owner',true),('c1-manager','c1-manager@example.test','Manager',true),
      ('c1-foreign','c1-foreign@example.test','Foreign',true)`);
    await admin.query(
      "insert into public.memberships(company_id,user_id,role,branch_id) values($1,'c1-owner','owner',null),($1,'c1-manager','branch_manager',$3),($2,'c1-foreign','owner',null)",
      [a, b, branch],
    );
    await admin.query(
      "insert into public.permission_overrides(company_id,user_id,permission,effect) values($1,'c1-manager','attendance.record','deny'),($1,'c1-manager','permissions.manage','allow'),($1,'c1-manager','future.key','deny')",
      [a],
    );
  });
  afterAll(async () => {
    if (admin) {
      await admin.query("delete from public.companies where id=any($1::uuid[])", [[a, b]]);
      await admin.query(
        `delete from public."user" where id in ('c1-owner','c1-manager','c1-foreign')`,
      );
      await admin.end();
      await getPool().end();
    }
    vi.unstubAllEnvs();
  });
  it("owner changes target permission and preserves legacy deny with exactly one audit", async () => {
    const result = await withUser("c1-owner", (db) =>
      saveMemberOverrides(pgPermissionAdminRepository(db, "c1-owner"), "c1-owner", {
        ...base,
        overrides: { ...base.overrides, "pos.access": "allow" },
        restrictions: { ...base.restrictions, "attendance.record": "deny" },
      }),
    );
    expect(result.overrides["pos.access"]).toBe("allow");
    expect(result.unknownKeys).toEqual(["future.key"]);
    expect(result.restrictions["attendance.record"]).toBe("deny");
    expect(
      await withUser(
        "c1-manager",
        async (db) =>
          (await db.query("select public.has_permission($1,'pos.access') as allowed", [a])).rows[0]
            ?.allowed,
      ),
    ).toBe(true);
    const { rows } = await admin.query(
      "select details from public.audit_log where company_id=$1 and action='permissions.changed'",
      [a],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.details.before).toContainEqual({
      permission: "attendance.record",
      effect: "deny",
    });
    expect(rows[0]?.details.after).toContainEqual({ permission: "pos.access", effect: "allow" });
    expect(rows[0]?.details.after).toContainEqual({
      permission: "permissions.manage",
      effect: "allow",
    });
  });
  it("clearing managed overrides restores defaults and removes restriction rows", async () => {
    const result = await withUser("c1-owner", (db) =>
      saveMemberOverrides(pgPermissionAdminRepository(db, "c1-owner"), "c1-owner", base),
    );
    expect(result.overrides["pos.access"]).toBe("default");
    expect(result.effective).not.toContain("pos.access");
    expect(result.restrictions["attendance.record"]).toBe("default");
  });
  it("manager cannot list or save even with permissions.manage=allow", async () => {
    await expect(
      withUser("c1-manager", (db) =>
        listMemberPermissions(pgPermissionAdminRepository(db, "c1-manager"), a),
      ),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      withUser("c1-manager", (db) =>
        saveMemberOverrides(pgPermissionAdminRepository(db, "c1-manager"), "c1-manager", base),
      ),
    ).rejects.toThrow("FORBIDDEN");
  });
  it("RLS refuses a direct non-owner override write", async () => {
    await expect(
      withUser("c1-manager", (db) =>
        db.query(
          "insert into public.permission_overrides(company_id,user_id,permission,effect) values($1,'c1-manager','pos.access','allow')",
          [a],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("owner A cannot access B or target B's user", async () => {
    await expect(
      withUser("c1-owner", (db) =>
        saveMemberOverrides(pgPermissionAdminRepository(db, "c1-owner"), "c1-owner", {
          ...base,
          companyId: b,
        }),
      ),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      withUser("c1-owner", (db) =>
        saveMemberOverrides(pgPermissionAdminRepository(db, "c1-owner"), "c1-owner", {
          ...base,
          userId: "c1-foreign",
        }),
      ),
    ).rejects.toThrow("MEMBER_NOT_FOUND");
    expect(
      (await admin.query("select * from public.permission_overrides where company_id=$1", [b]))
        .rows,
    ).toHaveLength(0);
  });
  it("directory returns no foreign-company or non-owner data", async () => {
    expect(
      await withUser(
        "c1-owner",
        async (db) =>
          (await db.query("select * from public.company_member_directory($1)", [b])).rows,
      ),
    ).toEqual([]);
    expect(
      await withUser(
        "c1-manager",
        async (db) =>
          (await db.query("select * from public.company_member_directory($1)", [a])).rows,
      ),
    ).toEqual([]);
  });
  it("audit failure rolls back replacement rows", async () => {
    await expect(
      withUser("c1-owner", async (db) => {
        await saveMemberOverrides(pgPermissionAdminRepository(db, "c1-owner"), "c1-owner", {
          ...base,
          overrides: { ...base.overrides, "reports.view": "deny" },
        });
        throw new Error("Simulated transaction failure");
      }),
    ).rejects.toThrow("Simulated transaction failure");
    expect(
      (
        await withUser("c1-owner", (db) =>
          listMemberPermissions(pgPermissionAdminRepository(db, "c1-owner"), a),
        )
      ).find((member) => member.userId === "c1-manager")?.overrides["reports.view"],
    ).toBe("default");
  });
});
