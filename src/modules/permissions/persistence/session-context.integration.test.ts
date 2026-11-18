// @vitest-environment node
import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { getPool, withUser } from "@/lib/server/db.server";
import { effectivePermissions } from "../domain/permission-matrix";
import { companyRoleSchema, permissionKeySchema } from "../contracts";
import { pgSessionContextRepository } from "./session-context.server";
import { requirePermission } from "./permission-check.server";
import { readAttendanceOverview } from "@/modules/attendance/index.server";
import { readStaffCount } from "@/modules/staff/index.server";
const url = process.env["POSPAY_TEST_DATABASE_URL"];
const company = "60000000-0000-4000-8000-000000000001",
  foreign = "60000000-0000-4000-8000-000000000002",
  branch = "60000000-0000-4000-8000-000000000003",
  otherBranch = "60000000-0000-4000-8000-000000000004";
describe.skipIf(!url)("workspace persistence and SQL/domain parity", () => {
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
      `insert into public.companies(id,name,business_type) values($1,'Workspace salon','salon'),($2,'Foreign laundry','laundry')`,
      [company, foreign],
    );
    await admin.query(
      `insert into public.branches(id,company_id,name,timezone) values($1,$2,'Nails','UTC'),($3,$2,'Hair','UTC')`,
      [branch, company, otherBranch],
    );
    for (const role of companyRoleSchema.options)
      await admin.query(
        "insert into public.memberships(company_id,user_id,role,branch_id) values($1,$2,$3,$4)",
        [company, `ws-${role}`, role, role === "branch_manager" ? branch : null],
      );
    await admin.query(
      `insert into public.memberships(company_id,user_id,role) values($1,'ws-foreign','owner')`,
      [foreign],
    );
    await admin.query(
      `insert into public.permission_overrides(company_id,user_id,permission,effect) values($1,'ws-branch_manager','reports.view','allow')`,
      [foreign],
    );
    await admin.query(
      `insert into public.staff_members(company_id,branch_id,user_id,display_name) values($1,$2,'ws-staff','Nails staff'),($1,$3,'ws-other-staff','Hair staff')`,
      [company, branch, otherBranch],
    );
    await admin.query(
      `insert into public.attendance_records(company_id,id,staff_id,branch_id,work_date,check_in_at,status) select company_id,gen_random_uuid(),id,branch_id,current_date,now(),'open' from public.staff_members where company_id=$1`,
      [company],
    );
  });
  afterAll(async () => {
    if (admin) {
      await admin.query("delete from public.companies where id=any($1::uuid[])", [
        [company, foreign],
      ]);
      await admin.end();
      await getPool().end();
    }
    vi.unstubAllEnvs();
  });
  for (const role of companyRoleSchema.options)
    for (const key of permissionKeySchema.options)
      it(`${role} × ${key} agrees with the domain`, async () => {
        const result = await withUser(
          `ws-${role}`,
          async (db) =>
            (await db.query("select public.has_permission($1,$2) as allowed", [company, key]))
              .rows[0]?.allowed,
        );
        expect(result).toBe(effectivePermissions([role], []).includes(key));
      });
  it("allow and deny agree for every key, with deny winning", async () => {
    await admin.query(
      `insert into public.permission_overrides(company_id,user_id,permission,effect) values($1,'ws-branch_manager','pos.access','allow'),($1,'ws-branch_manager','reports.view','deny'),($1,'ws-branch_manager','pos.access','deny')`,
      [company],
    );
    await withUser("ws-branch_manager", async (db) => {
      const repo = pgSessionContextRepository(db, "ws-branch_manager");
      const overrides = await repo.listOverrides(company);
      for (const key of permissionKeySchema.options)
        expect(
          (await db.query("select public.has_permission($1,$2) as allowed", [company, key])).rows[0]
            ?.allowed,
        ).toBe(effectivePermissions(["branch_manager"], overrides).includes(key));
      expect(effectivePermissions(["branch_manager"], overrides)).not.toContain("pos.access");
    });
  });
  it("returns typed branch/business labels and drops unknown permission keys", async () => {
    await admin.query(
      `insert into public.permission_overrides(company_id,user_id,permission,effect) values($1,'ws-staff','legacy.permission','allow')`,
      [company],
    );
    await withUser("ws-branch_manager", async (db) =>
      expect(
        await pgSessionContextRepository(db, "ws-branch_manager").listCompanyWorkspaces(),
      ).toEqual([
        {
          kind: "company",
          companyId: company,
          companyName: "Workspace salon",
          businessType: "salon",
          role: "branch_manager",
          branchId: branch,
          branchName: "Nails",
        },
      ]),
    );
    await withUser("ws-staff", async (db) =>
      expect(await pgSessionContextRepository(db, "ws-staff").listOverrides(company)).toEqual([]),
    );
  });
  it("does not return or grant another company overrides", async () => {
    await withUser("ws-owner", async (db) => {
      expect(await pgSessionContextRepository(db, "ws-owner").listOverrides(foreign)).toEqual([]);
      await expect(requirePermission(db, foreign, "reports.view")).rejects.toThrow("FORBIDDEN");
    });
  });
  it("keeps owner immune to overrides and rejects orphan grants", async () => {
    await admin.query(
      `insert into public.permission_overrides(company_id,user_id,permission,effect) values($1,'ws-owner','pos.access','deny'),($1,'ws-orphan','reports.view','allow')`,
      [company],
    );
    await withUser("ws-owner", (db) => requirePermission(db, company, "pos.access"));
    await expect(
      withUser("ws-orphan", (db) => requirePermission(db, company, "reports.view")),
    ).rejects.toThrow("FORBIDDEN");
  });
  it("platform counts refuse company owners and allow platform-only admins", async () => {
    await withUser("ws-owner", async (db) =>
      expect((await db.query("select * from public.platform_overview()")).rows).toEqual([]),
    );
    await admin.query(`insert into public.platform_admins(user_id) values('ws-platform')`);
    try {
      await withUser("ws-platform", async (db) => {
        expect(await pgSessionContextRepository(db, "ws-platform").isPlatformAdmin()).toBe(true);
        expect((await db.query("select * from public.platform_overview()")).rows).toHaveLength(1);
      });
    } finally {
      await admin.query(`delete from public.platform_admins where user_id='ws-platform'`);
    }
  });
  it("narrows dashboard counts to the selected branch", async () => {
    await withUser("ws-branch_manager", async (db) => {
      expect(await readStaffCount(db, company, branch)).toBe("1");
      expect(await readAttendanceOverview(db, company, branch)).toEqual({
        present: "1",
        exceptions: "0",
      });
    });
  });
});
