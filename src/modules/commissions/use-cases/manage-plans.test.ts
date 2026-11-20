import { describe, expect, test } from "vitest";
import {
  addPlanVersion,
  assignPlan,
  createPlanWithVersion,
  loadPlansScreen,
  toPlanRules,
} from "./manage-plans";
import type { PlanRules } from "../domain/plan";
import type { CommissionPeriod } from "../domain/period";
import type {
  AddCommissionPlanVersionInput,
  CommissionPlanRepository,
  PlanWithVersions,
  StaffAssignment,
} from "../ports/plan-repository";

const period: CommissionPeriod = { year: 2027, month: 3 };

function fakeRepo() {
  const calls: string[] = [];
  const versions: { planId: string; version: number; rules: PlanRules }[] = [];
  let nextVersion = 1;
  const repo: CommissionPlanRepository = {
    createPlan: async (input) => {
      calls.push(`create:${input.name.trim()}`);
      return { id: "plan-1" };
    },
    addVersion: async (input: AddCommissionPlanVersionInput) => {
      calls.push(`version:${input.planId}:${input.effectiveMonth}`);
      const version = { planId: input.planId, version: nextVersion++, rules: input.rules };
      versions.push(version);
      return { id: `version-${version.version}`, version: version.version };
    },
    assign: async (input) => {
      calls.push(`assign:${input.staffId}:${input.planId}:${input.effectiveMonth}`);
      return { id: "assignment-1" };
    },
    resolve: async () => null,
    listPlansWithLatestVersions: async (): Promise<PlanWithVersions[]> => [
      {
        id: "plan-1",
        name: "Hair",
        versions: [
          {
            id: "version-1",
            version: 1,
            effectiveMonth: "2027-03-01",
            rules: { baseRateBp: 500n, baseFixedMills: 2000n, tierSchedule: null },
          },
        ],
      },
    ],
    listStaffAssignments: async (): Promise<StaffAssignment[]> => [
      {
        staffId: "staff-1",
        staffName: "Huda",
        branchId: "b1",
        planId: "plan-1",
        planName: "Hair",
        effectiveMonth: "2027-03-01",
      },
      {
        staffId: "staff-2",
        staffName: "Salma",
        branchId: "b1",
        planId: null,
        planName: null,
        effectiveMonth: null,
      },
    ],
  };
  return { repo, calls, versions };
}

describe("toPlanRules (021 contract, zero floats)", () => {
  test("converts percent, fixed KWD and salary-multiple tiers", () => {
    expect(
      toPlanRules({
        baseRatePercent: "2.5",
        baseFixedKwd: "2.000",
        tierSchedule: {
          accumulator: "sales_amount",
          mode: "all_after",
          thresholdKind: "salary_multiple",
          tiers: [
            {
              ratePercent: "5",
              threshold: { kind: "salary_multiple", multiple: "2.5" },
            },
          ],
        },
      }),
    ).toEqual({
      baseRateBp: 250n,
      baseFixedMills: 2000n,
      tierSchedule: {
        accumulator: "sales_amount",
        mode: "all_after",
        thresholdKind: "salary_multiple",
        tiers: [{ rateBp: 500n, threshold: { kind: "salary_multiple", multipleMilli: 2500n } }],
      },
    });
  });

  test("converts session-count brackets with a fixed reward", () => {
    expect(
      toPlanRules({
        tierSchedule: {
          accumulator: "session_count",
          mode: "excess",
          tiers: [{ afterSessions: 20, reward: { kind: "fixed_mills", kwd: "2.500" } }],
        },
      }).tierSchedule,
    ).toEqual({
      accumulator: "session_count",
      mode: "excess",
      tiers: [{ afterSessions: 20, reward: { kind: "fixed_mills", mills: 2500n } }],
    });
  });
});

describe("manage-plans use cases (021 M6/M8)", () => {
  test("creates a plan with its first version after validation", async () => {
    const f = fakeRepo();
    const result = await createPlanWithVersion(f.repo, {
      name: " Nails ",
      effectiveMonth: "2027-03-01",
      rules: { baseRatePercent: "10" },
    });
    expect(result).toEqual({ id: "plan-1", versionId: "version-1", version: 1 });
    expect(f.calls).toEqual(["create:Nails", "version:plan-1:2027-03-01"]);
    expect(f.versions[0]?.rules).toEqual({
      baseRateBp: 1000n,
      baseFixedMills: null,
      tierSchedule: null,
    });
  });

  test("refuses an empty plan and an invalid name without writing", async () => {
    const f = fakeRepo();
    await expect(
      createPlanWithVersion(f.repo, { name: "X", effectiveMonth: "2027-03-01", rules: {} }),
    ).rejects.toMatchObject({ code: "PLAN_EMPTY" });
    await expect(
      createPlanWithVersion(f.repo, {
        name: "   ",
        effectiveMonth: "2027-03-01",
        rules: { baseRatePercent: "1" },
      }),
    ).rejects.toMatchObject({ code: "PLAN_INVALID" });
    expect(f.calls).toEqual([]);
  });

  test("refuses descending brackets without writing", async () => {
    const f = fakeRepo();
    await expect(
      addPlanVersion(f.repo, {
        planId: "plan-1",
        effectiveMonth: "2027-03-01",
        rules: {
          tierSchedule: {
            accumulator: "sales_amount",
            mode: "excess",
            thresholdKind: "fixed",
            tiers: [
              { ratePercent: "5", threshold: { kind: "fixed", kwd: "2.000" } },
              { ratePercent: "8", threshold: { kind: "fixed", kwd: "1.000" } },
            ],
          },
        },
      }),
    ).rejects.toMatchObject({ code: "PLAN_INVALID" });
    expect(f.calls).toEqual([]);
  });

  test("assigns a plan from the month start and loads the screen with a no-plan badge", async () => {
    const f = fakeRepo();
    await expect(
      assignPlan(f.repo, { staffId: "staff-1", planId: "plan-1", effectiveMonth: "2027-04-01" }),
    ).resolves.toEqual({ id: "assignment-1" });
    const screen = await loadPlansScreen(f.repo, period);
    expect(screen.plans[0]).toMatchObject({ name: "Hair" });
    expect(screen.plans[0]?.versions[0]?.rules).toEqual({
      baseRateBp: "500",
      baseFixedMills: "2000",
      tierSchedule: null,
    });
    expect(screen.staff[0]).toMatchObject({ planName: "Hair" });
    expect(screen.staff[1]).toMatchObject({ staffName: "Salma", planId: null, planName: null });
  });
});
