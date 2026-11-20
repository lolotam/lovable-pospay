// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type pg from "pg";
import { withUser } from "@/lib/server/db.server";
import { pgCommissionPlanRepository } from "./commission-plan.server";
import { pgCommissionSalesSource } from "./sales-source.server";
import { pgSalaryRepository } from "./salary.server";
import {
  assertOverrideManager,
  assertStaffOverrideManager,
  pgServiceOverrideRepository,
} from "./service-override.server";
import { computeStaffCommission } from "../use-cases/compute-staff-commission";
import { saveServiceOverride } from "../use-cases/manage-overrides";
import {
  branch1,
  branch2,
  cleanupCommissions,
  company,
  insertSession,
  manager1,
  march,
  owner,
  serviceA,
  serviceB,
  setupCommissions,
  staff1,
  staff2,
} from "./commissions-builder.fixture";
import type { PlanRules } from "../domain/plan";

const tenPercent: PlanRules = { baseRateBp: 1000n, baseFixedMills: null, tierSchedule: null };

describe.skipIf(!process.env["POSPAY_TEST_DATABASE_URL"])("021 overrides under real RLS", () => {
  let admin: pg.Pool;

  beforeAll(async () => {
    admin = await setupCommissions();
    await withUser(owner, async (db) => {
      const repository = pgCommissionPlanRepository(db, owner, company);
      const plan = await repository.createPlan({ name: "March base" });
      await repository.addVersion({
        planId: plan.id,
        effectiveMonth: "2027-03-01",
        rules: tenPercent,
      });
      await repository.assign({ staffId: staff1, planId: plan.id, effectiveMonth: "2027-03-01" });
    });
  });

  afterAll(async () => {
    if (admin) {
      await cleanupCommissions(admin);
      vi.unstubAllEnvs();
    }
  });

  it("applies a mid-day override by branch-local time and excludes it from the plan (#33)", async () => {
    await admin.query(
      `insert into public.service_commission_overrides(
         company_id,service_id,staff_id,effective_from,override_kind,rate_bp,created_by
       ) values($1,$2,$3,'2027-03-10T11:00:00+03:00','rate_bp',1500,$4)`,
      [company, serviceB, staff1, owner],
    );
    await insertSession(admin, {
      id: "21000000-0000-4000-8000-000000000020",
      serviceId: serviceB,
      staffId: staff1,
      branchId: branch1,
      occurredAt: "2027-03-10T07:00:00Z",
      price: "100.000",
    });
    await insertSession(admin, {
      id: "21000000-0000-4000-8000-000000000021",
      serviceId: serviceB,
      staffId: staff1,
      branchId: branch1,
      occurredAt: "2027-03-10T12:00:00Z",
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
        qualifyingSalesMills: 100000n,
        baseRateMills: 10000n,
        overrideMills: 15000n,
        totalMills: 25000n,
      },
    });
  });

  it("counts a Kuwait-local boundary session in March, not February (#31)", async () => {
    await insertSession(admin, {
      id: "21000000-0000-4000-8000-000000000022",
      serviceId: serviceA,
      staffId: staff1,
      branchId: branch1,
      occurredAt: "2027-02-28T20:00:00Z",
      price: "50.000",
    });
    await insertSession(admin, {
      id: "21000000-0000-4000-8000-000000000023",
      serviceId: serviceA,
      staffId: staff1,
      branchId: branch1,
      occurredAt: "2027-02-28T21:30:00Z",
      price: "30.000",
    });
    await insertSession(admin, {
      id: "21000000-0000-4000-8000-000000000027",
      serviceId: serviceA,
      staffId: staff1,
      branchId: branch1,
      occurredAt: "2027-02-10T10:00:00Z",
      price: "50.000",
    });
    const marchLines = await withUser(owner, (db) =>
      pgCommissionSalesSource(db).listLines(company, staff1, march),
    );
    expect(marchLines.map((line) => line.sessionId)).toEqual([
      "21000000-0000-4000-8000-000000000023",
      "21000000-0000-4000-8000-000000000020",
      "21000000-0000-4000-8000-000000000021",
    ]);
    const februaryLines = await withUser(owner, (db) =>
      pgCommissionSalesSource(db).listLines(company, staff1, { year: 2027, month: 2 }),
    );
    expect(februaryLines.map((line) => line.sessionId)).toEqual([
      "21000000-0000-4000-8000-000000000027",
      "21000000-0000-4000-8000-000000000022",
    ]);
  });

  it("pays matching overrides for a staff member without a plan (#34)", async () => {
    await withUser(owner, (db) =>
      saveServiceOverride(pgServiceOverrideRepository(db, owner, company), {
        serviceId: serviceB,
        staffId: null,
        override: { kind: "fixed_mills", kwd: "3.000" },
      }),
    );
    await insertSession(admin, {
      id: "21000000-0000-4000-8000-000000000024",
      serviceId: serviceB,
      staffId: staff2,
      branchId: branch2,
      occurredAt: "2027-03-12T10:00:00Z",
      price: "100.000",
    });
    await insertSession(admin, {
      id: "21000000-0000-4000-8000-000000000025",
      serviceId: serviceB,
      staffId: staff2,
      branchId: branch2,
      occurredAt: "2027-03-12T11:00:00Z",
      price: "100.000",
    });
    await insertSession(admin, {
      id: "21000000-0000-4000-8000-000000000026",
      serviceId: serviceA,
      staffId: staff2,
      branchId: branch2,
      occurredAt: "2027-03-12T12:00:00Z",
      price: "50.000",
    });
    const output = await withUser(owner, (db) =>
      computeStaffCommission(
        {
          plans: pgCommissionPlanRepository(db, owner, company),
          sales: pgCommissionSalesSource(db),
          salary: pgSalaryRepository(db, owner, company),
          overrides: pgServiceOverrideRepository(db, owner, company),
        },
        { companyId: company, staffId: staff2, period: march },
      ),
    );
    expect(output.status).toBe("no_plan");
    if (output.status === "no_plan")
      expect(output.result).toMatchObject({
        overrideMills: 6000n,
        overrideSessionCount: 2,
        totalMills: 6000n,
      });
  });

  it("refuses override writes without the grant and outside the branch (#35)", async () => {
    await expect(withUser(manager1, (db) => assertOverrideManager(db, company))).rejects.toThrow(
      "FORBIDDEN",
    );
    await expect(
      withUser(manager1, (db) =>
        saveServiceOverride(pgServiceOverrideRepository(db, manager1, company), {
          serviceId: serviceA,
          staffId: null,
          override: { kind: "rate_bp", ratePercent: "5" },
        }),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await admin.query(
      `insert into public.permission_overrides(company_id,user_id,permission,effect)
       values($1,$2,'commissions.overrides.manage','allow')`,
      [company, manager1],
    );
    await expect(
      withUser(manager1, (db) =>
        saveServiceOverride(pgServiceOverrideRepository(db, manager1, company), {
          serviceId: serviceA,
          staffId: null,
          override: { kind: "rate_bp", ratePercent: "5" },
        }),
      ),
    ).resolves.toHaveProperty("id");
    await expect(
      withUser(manager1, (db) =>
        saveServiceOverride(pgServiceOverrideRepository(db, manager1, company), {
          serviceId: serviceA,
          staffId: staff1,
          override: { kind: "fixed_mills", kwd: "5.000" },
        }),
      ),
    ).resolves.toHaveProperty("id");
    await expect(
      withUser(manager1, (db) => assertStaffOverrideManager(db, company, staff2)),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      withUser(manager1, (db) =>
        saveServiceOverride(pgServiceOverrideRepository(db, manager1, company), {
          serviceId: serviceA,
          staffId: staff2,
          override: { kind: "clear" },
        }),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    const overridden = await withUser(owner, (db) =>
      pgServiceOverrideRepository(db, owner, company).overrideHistory(
        company,
        staff1,
        "2027-04-01",
      ),
    );
    expect(overridden.length).toBeGreaterThanOrEqual(2);
  });
});
