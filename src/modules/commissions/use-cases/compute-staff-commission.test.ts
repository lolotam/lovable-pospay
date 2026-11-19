import { describe, expect, test } from "vitest";
import { computeStaffCommission } from "./compute-staff-commission";
import type { PlanRules, SalesLine } from "../domain/plan";
import type { CommissionPeriod } from "../domain/period";
import type { CommissionPlanRepository, ResolvedPlan } from "../ports/plan-repository";
import type { CommissionSalesSource } from "../ports/sales-source";
import type { SalarySource } from "../ports/salary-source";

const PERIOD: CommissionPeriod = { year: 2027, month: 2 };
const HAIR_PLAN: PlanRules = {
  baseRateBp: null,
  tier: {
    mode: "excess",
    rateBp: 500n,
    threshold: { kind: "salary_multiple", multipleMilli: 2000n },
  },
};
const LASH_PLAN: PlanRules = {
  baseRateBp: null,
  tier: {
    mode: "excess",
    rateBp: 2000n,
    threshold: { kind: "fixed", mills: 5000000n },
  },
};
const MASSAGE_PLAN: PlanRules = { baseRateBp: 100n, tier: null };

function resolved(rules: PlanRules): ResolvedPlan {
  return { planId: "plan-1", planName: "Hair", versionId: "version-2", version: 2, rules };
}

function fakes(
  plan: ResolvedPlan | null,
  lines: SalesLine[],
  salaryMills: bigint | null | ((date: string) => bigint),
) {
  const salaryDates: string[] = [];
  const plans: CommissionPlanRepository = {
    createPlan: async () => {
      throw new Error("Unexpected createPlan");
    },
    addVersion: async () => {
      throw new Error("Unexpected addVersion");
    },
    assign: async () => {
      throw new Error("Unexpected assign");
    },
    resolve: async () => plan,
  };
  const sales: CommissionSalesSource = { listLines: async () => lines };
  const salary: SalarySource = {
    salaryOn: async (_companyId, _staffId, date) => {
      salaryDates.push(date);
      return typeof salaryMills === "function" ? salaryMills(date) : salaryMills;
    },
  };
  return { deps: { plans, sales, salary }, salaryDates };
}

const input = { companyId: "company-1", staffId: "staff-1", period: PERIOD };

describe("computeStaffCommission", () => {
  test("acceptance row 13 uses the salary on 28 February after a mid-month change", async () => {
    const salaryOn = (date: string) => (date < "2027-02-15" ? 450000n : 500000n);
    const f = fakes(
      resolved(HAIR_PLAN),
      [{ sessionId: "session-1", netMills: 1600000n }],
      salaryOn,
    );
    const output = await computeStaffCommission(f.deps, input);
    expect(output).toMatchObject({
      status: "ok",
      result: { thresholdMills: 1000000n, totalMills: 30000n },
    });
    expect(f.salaryDates).toEqual(["2027-02-28"]);
  });

  test("acceptance row 14 rejects a salary-linked tier when no salary exists", async () => {
    const f = fakes(resolved(HAIR_PLAN), [{ sessionId: "session-1", netMills: 1600000n }], null);
    await expect(computeStaffCommission(f.deps, input)).rejects.toMatchObject({
      code: "SALARY_REQUIRED",
    });
    expect(f.salaryDates).toEqual(["2027-02-28"]);
  });

  test("acceptance row 16 reports NO_PLAN without reading sales or salary", async () => {
    const f = fakes(null, [], 500000n);
    await expect(computeStaffCommission(f.deps, input)).resolves.toEqual({ status: "no_plan" });
    expect(f.salaryDates).toEqual([]);
  });

  test.each([
    { name: "fixed-threshold lash plan", rules: LASH_PLAN, netMills: 6250000n, total: 250000n },
    { name: "base-only massage plan", rules: MASSAGE_PLAN, netMills: 100000n, total: 1000n },
  ])("does not request salary for a $name", async ({ rules, netMills, total }) => {
    const f = fakes(resolved(rules), [{ sessionId: "session-1", netMills }], 500000n);
    const output = await computeStaffCommission(f.deps, input);
    expect(output).toMatchObject({ status: "ok", result: { totalMills: total } });
    expect(f.salaryDates).toEqual([]);
  });
});
