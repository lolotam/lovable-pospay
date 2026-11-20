// @vitest-environment node
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type pg from "pg";
import { withUser } from "@/lib/server/db.server";
import { pgCommissionPlanRepository } from "./commission-plan.server";
import { pgCommissionSalesSource } from "./sales-source.server";
import { pgSalaryRepository, assertSalaryManager } from "./salary.server";
import { pgServiceOverrideRepository } from "./service-override.server";
import { computeStaffCommission } from "../use-cases/compute-staff-commission";
import { recordSalary } from "../use-cases/manage-salaries";
import {
  cleanupCommissions,
  company,
  february,
  insertSession,
  january,
  manager1,
  march,
  owner,
  reception,
  serviceA,
  serviceB,
  setupCommissions,
  staff1,
  staff2,
} from "./commissions-builder.fixture";
import type { PlanRules } from "../domain/plan";

const hairPlan: PlanRules = {
  baseRateBp: null,
  baseFixedMills: null,
  tierSchedule: {
    accumulator: "sales_amount",
    mode: "excess",
    thresholdKind: "salary_multiple",
    tiers: [{ rateBp: 500n, threshold: { kind: "salary_multiple", multipleMilli: 2000n } }],
  },
};

describe.skipIf(!process.env["POSPAY_TEST_DATABASE_URL"])(
  "021 plans and salaries under real RLS",
  () => {
    let admin: pg.Pool;

    beforeAll(async () => {
      admin = await setupCommissions();
    });

    afterAll(async () => {
      if (admin) {
        await cleanupCommissions(admin);
        vi.unstubAllEnvs();
      }
    });

    it("backfills a legacy 0024 single-tier version into resolvable tiers", async () => {
      const plan = await withUser(owner, (db) =>
        pgCommissionPlanRepository(db, owner, company).createPlan({ name: "Legacy plan" }),
      );
      const legacy = await admin.query(
        `insert into public.commission_plan_versions(
         company_id,plan_id,version,effective_month,base_rate_bp,tier_mode,tier_accumulator,
         tier_rate_bp,tier_salary_multiple_milli,created_by
       ) values($1,$2,1,'2027-01-01',100,'all_after','sales_amount',1000,3000,$3) returning id`,
        [company, plan.id, owner],
      );
      const legacyVersionId = legacy.rows[0]!.id;
      await withUser(owner, (db) =>
        pgCommissionPlanRepository(db, owner, company).assign({
          staffId: staff1,
          planId: plan.id,
          effectiveMonth: "2027-01-01",
        }),
      );
      await admin.query(
        await readFile("db/migrations/0026_commission_methods_and_salaries.sql", "utf8"),
      );
      const tiers = await admin.query(
        "select rate_bp,threshold_salary_multiple_milli from public.commission_plan_tiers where company_id=$1 and version_id=$2",
        [company, legacyVersionId],
      );
      expect(tiers.rows).toEqual([{ rate_bp: 1000, threshold_salary_multiple_milli: 3000 }]);
      await expect(
        withUser(owner, (db) =>
          pgCommissionPlanRepository(db, owner, company).resolve(company, staff1, january),
        ),
      ).resolves.toMatchObject({
        planId: plan.id,
        rules: {
          baseRateBp: 100n,
          tierSchedule: {
            accumulator: "sales_amount",
            mode: "all_after",
            thresholdKind: "salary_multiple",
            tiers: [
              { rateBp: 1000n, threshold: { kind: "salary_multiple", multipleMilli: 3000n } },
            ],
          },
        },
      });
    });

    it("creates a multi-tier version in one transaction and locks committed tiers", async () => {
      const brackets: PlanRules = {
        baseRateBp: 200n,
        baseFixedMills: null,
        tierSchedule: {
          accumulator: "sales_amount",
          mode: "excess",
          thresholdKind: "fixed",
          tiers: [
            { rateBp: 500n, threshold: { kind: "fixed", mills: 1000000n } },
            { rateBp: 800n, threshold: { kind: "fixed", mills: 2000000n } },
          ],
        },
      };
      const created = await withUser(owner, async (db) => {
        const repository = pgCommissionPlanRepository(db, owner, company);
        const plan = await repository.createPlan({ name: "Brackets" });
        const added = await repository.addVersion({
          planId: plan.id,
          effectiveMonth: "2027-02-01",
          rules: brackets,
        });
        await repository.assign({ staffId: staff1, planId: plan.id, effectiveMonth: "2027-02-01" });
        return { planId: plan.id, versionId: added.id };
      });
      const tiers = await admin.query(
        "select tier_order,rate_bp from public.commission_plan_tiers where company_id=$1 and version_id=$2 order by tier_order",
        [company, created.versionId],
      );
      expect(tiers.rows).toEqual([
        { tier_order: 1, rate_bp: 500 },
        { tier_order: 2, rate_bp: 800 },
      ]);
      await expect(
        withUser(owner, (db) =>
          db.query(
            `insert into public.commission_plan_tiers(company_id,version_id,tier_order,rate_bp,threshold_mills)
           values($1,$2,3,900,3000000)`,
            [company, created.versionId],
          ),
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        withUser(owner, (db) =>
          pgCommissionPlanRepository(db, owner, company).resolve(company, staff1, february),
        ),
      ).resolves.toMatchObject({ planId: created.planId, rules: brackets });
    });

    it("computes the salary-linked plan on real February sales with the raised salary (#30)", async () => {
      await withUser(owner, async (db) => {
        const repository = pgCommissionPlanRepository(db, owner, company);
        const plan = await repository.createPlan({ name: "Hair plan" });
        await repository.addVersion({
          planId: plan.id,
          effectiveMonth: "2027-02-01",
          rules: hairPlan,
        });
        await repository.assign({ staffId: staff1, planId: plan.id, effectiveMonth: "2027-02-01" });
      });
      await withUser(owner, (db) =>
        recordSalary(pgSalaryRepository(db, owner, company), {
          staffId: staff1,
          salaryKwd: "450.000",
          effectiveDate: "2027-01-01",
        }),
      );
      await withUser(owner, (db) =>
        recordSalary(pgSalaryRepository(db, owner, company), {
          staffId: staff1,
          salaryKwd: "500.000",
          effectiveDate: "2027-02-15",
        }),
      );
      await insertSession(admin, {
        id: "21000000-0000-4000-8000-000000000010",
        serviceId: serviceA,
        staffId: staff1,
        branchId: "21000000-0000-4000-8000-000000000002",
        occurredAt: "2027-02-05T10:00:00Z",
        price: "800.000",
      });
      await insertSession(admin, {
        id: "21000000-0000-4000-8000-000000000011",
        serviceId: serviceA,
        staffId: staff1,
        branchId: "21000000-0000-4000-8000-000000000002",
        occurredAt: "2027-02-20T10:00:00Z",
        price: "800.000",
      });
      const output = await withUser(owner, (db) =>
        computeStaffCommission(
          {
            plans: pgCommissionPlanRepository(db, owner, company),
            sales: pgCommissionSalesSource(db),
            salary: pgSalaryRepository(db, owner, company),
          },
          { companyId: company, staffId: staff1, period: february },
        ),
      );
      expect(output).toMatchObject({
        status: "ok",
        result: { thresholdMills: 1000000n, tierMills: 30000n, totalMills: 30000n },
      });
    });

    it("scopes salaries by branch and audits at the database level (#32)", async () => {
      await expect(
        withUser(manager1, (db) => assertSalaryManager(db, company, staff2)),
      ).rejects.toThrow("FORBIDDEN");
      await expect(
        withUser(manager1, (db) =>
          pgSalaryRepository(db, manager1, company).salaryOn(company, staff2, "2027-02-28"),
        ),
      ).resolves.toBeNull();
      await expect(
        withUser(manager1, (db) =>
          db.query(
            "select count(*)::int as n from public.staff_salaries where company_id=$1 and staff_id=$2",
            [company, staff2],
          ),
        ),
      ).resolves.toMatchObject({ rows: [{ n: 0 }] });
      await expect(
        withUser(reception, (db) =>
          db.query("select count(*)::int as n from public.staff_salaries where company_id=$1", [
            company,
          ]),
        ),
      ).resolves.toMatchObject({ rows: [{ n: 0 }] });
      const audits = await admin.query(
        "select count(*)::int as n from public.audit_log where company_id=$1 and action='staff_salary.recorded'",
        [company],
      );
      expect(audits.rows[0].n).toBe(2);
    });

    it("pays an override saved on the month's last day (exclusive period end)", async () => {
      await admin.query(
        `insert into public.service_commission_overrides(
         company_id,service_id,staff_id,effective_from,override_kind,rate_bp,created_by
       ) values($1,$2,$3,'2027-03-31T10:00:00+03:00','rate_bp',2000,$4)`,
        [company, serviceB, staff1, owner],
      );
      await insertSession(admin, {
        id: "21000000-0000-4000-8000-000000000012",
        serviceId: serviceB,
        staffId: staff1,
        branchId: "21000000-0000-4000-8000-000000000002",
        occurredAt: "2027-03-31T09:00:00Z",
        price: "100.000",
      });
      const output = await withUser(owner, (db) =>
        computeStaffCommission(
          {
            plans: pgCommissionPlanRepository(db, owner, company),
            sales: pgCommissionSalesSource(db),
            salary: pgSalaryRepository(db, owner, company),
            overrides: pgServiceOverrideRepository(db, owner, company),
          },
          { companyId: company, staffId: staff1, period: march },
        ),
      );
      expect(output).toMatchObject({
        status: "ok",
        result: {
          qualifyingSalesMills: 0n,
          overrideSalesMills: 100000n,
          overrideMills: 20000n,
          totalMills: 20000n,
        },
      });
    });

    it("refuses a salary dated inside or before a closed month (SALARY_MONTH_CLOSED)", async () => {
      await admin.query(
        "insert into public.closed_commission_months(company_id,period_month,closed_by) values($1,'2026-10-01',$2)",
        [company, owner],
      );
      await expect(
        withUser(owner, (db) =>
          recordSalary(pgSalaryRepository(db, owner, company), {
            staffId: staff1,
            salaryKwd: "450.000",
            effectiveDate: "2026-10-20",
          }),
        ),
      ).rejects.toThrow("SALARY_MONTH_CLOSED");
      await expect(
        withUser(owner, (db) =>
          recordSalary(pgSalaryRepository(db, owner, company), {
            staffId: staff1,
            salaryKwd: "450.000",
            effectiveDate: "2026-12-01",
          }),
        ),
      ).resolves.toHaveProperty("id");
    });
  },
);
