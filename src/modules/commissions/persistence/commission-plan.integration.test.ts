// @vitest-environment node
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { getPool, withUser } from "@/lib/server/db.server";
import type { PlanRules } from "../domain/plan";
import { pgCommissionPlanRepository } from "./commission-plan.server";

const url = process.env["POSPAY_TEST_DATABASE_URL"];
const company = "19000000-0000-4000-8000-000000000101";
const branch1 = "19000000-0000-4000-8000-000000000102";
const branch2 = "19000000-0000-4000-8000-000000000103";
const staff1 = "19000000-0000-4000-8000-000000000104";
const staff2 = "19000000-0000-4000-8000-000000000105";
const owner = "c19-owner";
const manager1 = "c19-manager-1";
const manager2 = "c19-manager-2";
const reception = "c19-reception";
const period = { year: 2027, month: 1 };
const version1Rules: PlanRules = { baseRateBp: 100n, baseFixedMills: null, tierSchedule: null };
const version2Rules: PlanRules = {
  baseRateBp: 100n,
  baseFixedMills: null,
  tierSchedule: {
    accumulator: "sales_amount",
    mode: "all_after",
    thresholdKind: "salary_multiple",
    tiers: [{ rateBp: 1000n, threshold: { kind: "salary_multiple", multipleMilli: 3000n } }],
  },
};

describe.skipIf(!url)("commission plan repository under PostgreSQL RLS", () => {
  let admin: pg.Pool;
  let planId: string;

  beforeAll(async () => {
    if (!url || new URL(url).hostname !== "127.0.0.1" || new URL(url).pathname !== "/pospay_test")
      throw new Error("Disposable database required");
    vi.stubEnv("DATABASE_URL", url);
    admin = new pg.Pool({ connectionString: url });
    for (let pass = 0; pass < 2; pass++)
      for (const file of [
        "0001_tenancy_foundation",
        "0002_attendance",
        "0024_commission_plans",
        "0026_commission_methods_and_salaries",
      ]) {
        await admin.query(await readFile(`db/migrations/${file}.sql`, "utf8"));
      }
    await admin.query("insert into public.companies(id,name) values($1,'Commission salon')", [
      company,
    ]);
    await admin.query(
      "insert into public.branches(company_id,id,name) values($1,$2,'Branch 1'),($1,$3,'Branch 2')",
      [company, branch1, branch2],
    );
    await admin.query(
      `insert into public.memberships(company_id,user_id,role,branch_id) values
       ($1,$2,'owner',null),($1,$3,'branch_manager',$4),($1,$5,'branch_manager',$6),($1,$7,'reception',$4)`,
      [company, owner, manager1, branch1, manager2, branch2, reception],
    );
    await admin.query(
      `insert into public.staff_members(company_id,id,branch_id,user_id,display_name) values
       ($1,$2,$3,'c19-staff-1','Staff 1'),($1,$4,$5,'c19-staff-2','Staff 2')`,
      [company, staff1, branch1, staff2, branch2],
    );
  });

  afterAll(async () => {
    if (admin) {
      for (const table of [
        "audit_log",
        "staff_commission_plans",
        "commission_plan_tiers",
        "commission_plan_versions",
        "commission_plans",
        "staff_members",
        "memberships",
        "branches",
      ]) {
        await admin.query(`delete from public.${table} where company_id=$1`, [company]);
      }
      await admin.query("delete from public.companies where id=$1", [company]);
      await admin.end();
      await getPool().end();
    }
    vi.unstubAllEnvs();
  });

  it("resolves correcting version 2 for the same month", async () => {
    await withUser(owner, async (db) => {
      const repository = pgCommissionPlanRepository(db, owner, company);
      planId = (await repository.createPlan({ name: "Nails" })).id;
      await repository.addVersion({ planId, effectiveMonth: "2027-01-01", rules: version1Rules });
      const corrected = await repository.addVersion({
        planId,
        effectiveMonth: "2027-01-01",
        rules: version2Rules,
      });
      expect(corrected.version).toBe(2);
      await repository.assign({ staffId: staff1, planId, effectiveMonth: "2027-01-01" });
      await expect(repository.resolve(company, staff1, period)).resolves.toMatchObject({
        planId,
        version: 2,
        versionId: corrected.id,
        rules: version2Rules,
      });
    });
  });

  it("lets the branch 1 manager move branch 1 staff to another plan from February", async () => {
    const hairPlanId = await withUser(owner, async (db) => {
      const repository = pgCommissionPlanRepository(db, owner, company);
      const created = await repository.createPlan({ name: "Hair" });
      await repository.addVersion({
        planId: created.id,
        effectiveMonth: "2027-01-01",
        rules: version1Rules,
      });
      return created.id;
    });
    await withUser(manager1, (db) =>
      pgCommissionPlanRepository(db, manager1, company).assign({
        staffId: staff1,
        planId: hairPlanId,
        effectiveMonth: "2027-02-01",
      }),
    );
    await withUser(owner, async (db) => {
      const repository = pgCommissionPlanRepository(db, owner, company);
      await expect(
        repository.resolve(company, staff1, { year: 2027, month: 2 }),
      ).resolves.toMatchObject({
        planId: hairPlanId,
        version: 1,
      });
      await expect(repository.resolve(company, staff1, period)).resolves.toMatchObject({
        planId,
        version: 2,
      });
    });
  });

  it("refuses a branch 2 manager assigning branch 1 staff", async () => {
    await expect(
      withUser(manager2, (db) =>
        pgCommissionPlanRepository(db, manager2, company).assign({
          staffId: staff1,
          planId,
          effectiveMonth: "2027-02-01",
        }),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("shows no plans to reception", async () => {
    const count = await withUser(reception, async (db) => {
      const result = await db.query<{ count: number }>(
        "select count(*)::int as count from public.commission_plans where company_id=$1",
        [company],
      );
      return result.rows[0]?.count;
    });
    expect(count).toBe(0);
  });

  it("refuses updates to commission plans", async () => {
    await expect(
      withUser(owner, (db) =>
        db.query("update public.commission_plans set name='Changed' where company_id=$1", [
          company,
        ]),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("writes all three audit action kinds", async () => {
    const result = await admin.query<{ action: string }>(
      "select distinct action from public.audit_log where company_id=$1 order by action",
      [company],
    );
    expect(result.rows.map(({ action }) => action)).toEqual([
      "commission_plan.assigned",
      "commission_plan.created",
      "commission_plan.version_added",
    ]);
  });

  it("returns null for staff without an assignment", async () => {
    await withUser(owner, async (db) => {
      const repository = pgCommissionPlanRepository(db, owner, company);
      await expect(repository.resolve(company, staff2, period)).resolves.toBeNull();
    });
  });
});
