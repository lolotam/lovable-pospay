import { describe, expect, test } from "vitest";
import { computeStaffCommission } from "./compute-staff-commission";
import type { PlanRules, SalesLine, ServiceOverrideRow } from "../domain/plan";
import type { CommissionPeriod } from "../domain/period";
import type {
  CommissionPlanRepository,
  ResolvedPlan,
  StaffAssignment,
} from "../ports/plan-repository";
import type { ServiceOverrideRepository } from "../ports/override-repository";
import type { CommissionSalesSource } from "../ports/sales-source";
import type { SalarySource } from "../ports/salary-source";

const PERIOD: CommissionPeriod = { year: 2027, month: 2 };
const HAIR_PLAN: PlanRules = {
  baseRateBp: null,
  baseFixedMills: null,
  tierSchedule: {
    accumulator: "sales_amount",
    mode: "excess",
    thresholdKind: "salary_multiple",
    tiers: [{ rateBp: 500n, threshold: { kind: "salary_multiple", multipleMilli: 2000n } }],
  },
};
const LASH_PLAN: PlanRules = {
  baseRateBp: null,
  baseFixedMills: null,
  tierSchedule: {
    accumulator: "sales_amount",
    mode: "excess",
    thresholdKind: "fixed",
    tiers: [{ rateBp: 2000n, threshold: { kind: "fixed", mills: 5000000n } }],
  },
};
const MASSAGE_PLAN: PlanRules = { baseRateBp: 100n, baseFixedMills: null, tierSchedule: null };

function resolved(rules: PlanRules): ResolvedPlan {
  return { planId: "plan-1", planName: "Hair", versionId: "version-2", version: 2, rules };
}

function fakes(
  plan: ResolvedPlan | null,
  lines: SalesLine[],
  salaryMills: bigint | null | ((date: string) => bigint),
  history: ServiceOverrideRow[] = [],
) {
  const salaryDates: string[] = [];
  const reads: string[] = [];
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
    listPlansWithLatestVersions: async () => {
      throw new Error("Unexpected listPlansWithLatestVersions");
    },
    listStaffAssignments: async (): Promise<StaffAssignment[]> => [],
    resolve: async (companyId, staffId) => {
      reads.push(`plan:${companyId}:${staffId}`);
      return plan;
    },
  };
  const sales: CommissionSalesSource = {
    listLines: async (companyId, staffId) => {
      reads.push(`sales:${companyId}:${staffId}`);
      return lines;
    },
  };
  const salary: SalarySource = {
    salaryOn: async (companyId, staffId, date) => {
      reads.push(`salary:${companyId}:${staffId}`);
      salaryDates.push(date);
      return typeof salaryMills === "function" ? salaryMills(date) : salaryMills;
    },
  };
  const overrides: ServiceOverrideRepository = {
    saveOverride: async () => {
      throw new Error("Unexpected saveOverride");
    },
    listOverrides: async () => [],
    overrideHistory: async (companyId, staffId) => {
      reads.push(`overrides:${companyId}:${staffId}`);
      return history;
    },
  };
  return { deps: { plans, sales, salary, overrides }, salaryDates, reads };
}

const input = { companyId: "company-1", staffId: "staff-1", period: PERIOD };

describe("computeStaffCommission", () => {
  test("acceptance row 13 uses the salary on 28 February after a mid-month change", async () => {
    const salaryOn = (date: string) => (date < "2027-02-15" ? 450000n : 500000n);
    const f = fakes(
      resolved(HAIR_PLAN),
      [
        {
          sessionId: "session-1",
          occurredAt: new Date("2027-02-10T10:00:00Z"),
          netMills: 1600000n,
        },
      ],
      salaryOn,
    );
    const output = await computeStaffCommission(f.deps, input);
    expect(output).toMatchObject({
      status: "ok",
      result: { thresholdMills: 1000000n, totalMills: 30000n },
    });
    expect(f.salaryDates).toEqual(["2027-02-28"]);
    expect(f.reads).toEqual([
      "plan:company-1:staff-1",
      "sales:company-1:staff-1",
      "salary:company-1:staff-1",
      "overrides:company-1:staff-1",
    ]);
  });

  test("acceptance row 14 rejects a salary-linked tier when no salary exists", async () => {
    const f = fakes(
      resolved(HAIR_PLAN),
      [
        {
          sessionId: "session-1",
          occurredAt: new Date("2027-02-10T10:00:00Z"),
          netMills: 1600000n,
        },
      ],
      null,
    );
    await expect(computeStaffCommission(f.deps, input)).rejects.toMatchObject({
      code: "SALARY_REQUIRED",
    });
    expect(f.salaryDates).toEqual(["2027-02-28"]);
  });

  test("acceptance row 16 reports no_plan with a zero result", async () => {
    const f = fakes(null, [], 500000n);
    const output = await computeStaffCommission(f.deps, input);
    expect(output.status).toBe("no_plan");
    if (output.status === "no_plan") expect(output.result.totalMills).toBe(0n);
    expect(f.reads).toEqual([
      "plan:company-1:staff-1",
      "sales:company-1:staff-1",
      "overrides:company-1:staff-1",
    ]);
    expect(f.salaryDates).toEqual([]);
  });

  test("acceptance row 34 pays matching overrides for a staff member without a plan", async () => {
    const history: ServiceOverrideRow[] = [
      {
        id: "1",
        staffId: "staff-1",
        serviceId: "service-b",
        effectiveFrom: new Date("2027-01-01T00:00:00Z"),
        override: { kind: "fixed_mills", mills: 3000n },
      },
    ];
    const lines: SalesLine[] = [
      {
        sessionId: "b1",
        serviceId: "service-b",
        occurredAt: new Date("2027-02-10T10:00:00Z"),
        netMills: 50000n,
      },
      {
        sessionId: "b2",
        serviceId: "service-b",
        occurredAt: new Date("2027-02-10T11:00:00Z"),
        netMills: 50000n,
      },
      {
        sessionId: "a1",
        serviceId: "service-a",
        occurredAt: new Date("2027-02-10T12:00:00Z"),
        netMills: 100000n,
      },
    ];
    const f = fakes(null, lines, 500000n, history);
    const output = await computeStaffCommission(f.deps, input);
    expect(output).toMatchObject({
      status: "no_plan",
      result: { overrideMills: 6000n, totalMills: 6000n, qualifyingSessionCount: 1 },
    });
  });

  test("does not read overrides when no overrides port is wired", async () => {
    const plans: CommissionPlanRepository = {
      createPlan: async () => ({ id: "p" }),
      addVersion: async () => ({ id: "v", version: 1 }),
      assign: async () => ({ id: "a" }),
      listPlansWithLatestVersions: async () => [],
      listStaffAssignments: async () => [],
      resolve: async () => resolved(MASSAGE_PLAN),
    };
    const sales: CommissionSalesSource = {
      listLines: async () => [
        { sessionId: "s1", occurredAt: new Date("2027-02-10T10:00:00Z"), netMills: 100000n },
      ],
    };
    const salary: SalarySource = { salaryOn: async () => 500000n };
    const output = await computeStaffCommission({ plans, sales, salary }, input);
    expect(output).toMatchObject({ status: "ok", result: { totalMills: 1000n } });
  });

  test.each([
    { name: "fixed-threshold lash plan", rules: LASH_PLAN, netMills: 6250000n, total: 250000n },
    { name: "base-only massage plan", rules: MASSAGE_PLAN, netMills: 100000n, total: 1000n },
  ])("does not request salary for a $name", async ({ rules, netMills, total }) => {
    const f = fakes(
      resolved(rules),
      [{ sessionId: "session-1", occurredAt: new Date("2027-02-10T10:00:00Z"), netMills }],
      500000n,
    );
    const output = await computeStaffCommission(f.deps, input);
    expect(output).toMatchObject({ status: "ok", result: { totalMills: total } });
    expect(f.salaryDates).toEqual([]);
  });
});
