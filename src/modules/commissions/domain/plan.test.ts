import { describe, expect, test } from "vitest";
import { isMonthStart, isValidPlanName, validatePlanVersion } from "./plan";
import type { PlanRules, SalesTierSchedule } from "./plan";

const salesTier = (rateBp: bigint, mills: bigint) => ({
  rateBp,
  threshold: { kind: "fixed" as const, mills },
});
const validTierSchedule: SalesTierSchedule = {
  accumulator: "sales_amount",
  mode: "excess",
  thresholdKind: "fixed",
  tiers: [salesTier(500n, 1000n)],
};
const validTier: PlanRules = {
  baseRateBp: null,
  baseFixedMills: null,
  tierSchedule: validTierSchedule,
};
const validFixed: PlanRules = { baseRateBp: null, baseFixedMills: 2500n, tierSchedule: null };

describe("validatePlanVersion", () => {
  test.each([
    {
      name: "empty plan",
      rules: { baseRateBp: null, baseFixedMills: null, tierSchedule: null },
      expected: "PLAN_EMPTY",
    },
    { name: "zero base rate", rules: { ...validFixed, baseRateBp: 0n }, expected: "PLAN_INVALID" },
    {
      name: "base rate above 100 percent",
      rules: { ...validFixed, baseRateBp: 10001n },
      expected: "PLAN_INVALID",
    },
    {
      name: "zero fixed per session",
      rules: { baseRateBp: null, baseFixedMills: 0n, tierSchedule: null },
      expected: "PLAN_INVALID",
    },
    {
      name: "negative fixed per session",
      rules: { baseRateBp: null, baseFixedMills: -1n, tierSchedule: null },
      expected: "PLAN_INVALID",
    },
    {
      name: "zero tier rate",
      rules: {
        ...validTier,
        tierSchedule: { ...validTierSchedule, tiers: [salesTier(0n, 1000n)] },
      },
      expected: "PLAN_INVALID",
    },
    {
      name: "empty tier list",
      rules: { ...validTier, tierSchedule: { ...validTierSchedule, tiers: [] } },
      expected: "PLAN_INVALID",
    },
    {
      name: "equal bracket thresholds",
      rules: {
        ...validTier,
        tierSchedule: {
          ...validTierSchedule,
          tiers: [salesTier(500n, 2000n), salesTier(800n, 2000n)],
        },
      },
      expected: "PLAN_INVALID",
    },
    {
      name: "descending bracket thresholds",
      rules: {
        ...validTier,
        tierSchedule: {
          ...validTierSchedule,
          tiers: [salesTier(500n, 2000n), salesTier(800n, 1000n)],
        },
      },
      expected: "PLAN_INVALID",
    },
    {
      name: "negative fixed threshold",
      rules: {
        ...validTier,
        tierSchedule: { ...validTierSchedule, tiers: [salesTier(500n, -1n)] },
      },
      expected: "PLAN_INVALID",
    },
    {
      name: "fixed threshold above the bigint column",
      rules: {
        ...validTier,
        tierSchedule: { ...validTierSchedule, tiers: [salesTier(500n, 9223372036854775808n)] },
      },
      expected: "PLAN_INVALID",
    },
    {
      name: "zero salary multiple",
      rules: {
        ...validTier,
        tierSchedule: {
          ...validTierSchedule,
          thresholdKind: "salary_multiple" as const,
          tiers: [
            { rateBp: 500n, threshold: { kind: "salary_multiple" as const, multipleMilli: 0n } },
          ],
        },
      },
      expected: "PLAN_INVALID",
    },
    {
      name: "threshold kind mismatch inside the schedule",
      rules: {
        ...validTier,
        tierSchedule: {
          ...validTierSchedule,
          tiers: [
            salesTier(500n, 1000n),
            { rateBp: 800n, threshold: { kind: "salary_multiple" as const, multipleMilli: 2000n } },
          ],
        },
      } as PlanRules,
      expected: "PLAN_INVALID",
    },
    {
      name: "unknown tier mode",
      rules: {
        ...validTier,
        tierSchedule: { ...validTierSchedule, mode: "flat" },
      } as unknown as PlanRules,
      expected: "PLAN_INVALID",
    },
    {
      name: "session-count schedule with all_after mode",
      rules: {
        ...validTier,
        tierSchedule: {
          accumulator: "session_count" as const,
          mode: "all_after" as const,
          tiers: [],
        },
      } as unknown as PlanRules,
      expected: "PLAN_INVALID",
    },
    {
      name: "session-count with a zero fixed reward",
      rules: {
        baseRateBp: null,
        baseFixedMills: null,
        tierSchedule: {
          accumulator: "session_count" as const,
          mode: "excess" as const,
          tiers: [{ afterSessions: 5, reward: { kind: "fixed_mills" as const, mills: 0n } }],
        },
      },
      expected: "PLAN_INVALID",
    },
    {
      name: "session-count with a non-ascending count",
      rules: {
        baseRateBp: null,
        baseFixedMills: null,
        tierSchedule: {
          accumulator: "session_count" as const,
          mode: "excess" as const,
          tiers: [
            { afterSessions: 10, reward: { kind: "rate_bp" as const, rateBp: 1000n } },
            { afterSessions: 10, reward: { kind: "rate_bp" as const, rateBp: 1500n } },
          ],
        },
      },
      expected: "PLAN_INVALID",
    },
    {
      name: "more than twenty tiers",
      rules: {
        ...validTier,
        tierSchedule: {
          ...validTierSchedule,
          tiers: Array.from({ length: 21 }, (_, index) =>
            salesTier(500n, BigInt(index + 1) * 1000n),
          ),
        },
      },
      expected: "PLAN_INVALID",
    },
  ])("returns $expected for $name", ({ rules, expected }) => {
    expect(validatePlanVersion(rules)).toBe(expected);
  });

  test.each([
    {
      name: "base rate only",
      rules: { baseRateBp: 100n, baseFixedMills: null, tierSchedule: null },
    },
    { name: "fixed per session only", rules: validFixed },
    { name: "tier schedule only", rules: validTier },
    {
      name: "all methods combined",
      rules: { ...validTier, baseRateBp: 100n, baseFixedMills: 2000n },
    },
    {
      name: "twenty ascending tiers",
      rules: {
        ...validTier,
        tierSchedule: {
          ...validTierSchedule,
          tiers: Array.from({ length: 20 }, (_, index) =>
            salesTier(500n, BigInt(index + 1) * 1000n),
          ),
        },
      },
    },
    {
      name: "valid session-count schedule",
      rules: {
        baseRateBp: null,
        baseFixedMills: null,
        tierSchedule: {
          accumulator: "session_count" as const,
          mode: "excess" as const,
          tiers: [
            { afterSessions: 10, reward: { kind: "rate_bp" as const, rateBp: 1000n } },
            { afterSessions: 20, reward: { kind: "fixed_mills" as const, mills: 2500n } },
          ],
        },
      },
    },
  ])("accepts $name", ({ rules }) => {
    expect(validatePlanVersion(rules)).toBeNull();
  });
});

describe("isMonthStart", () => {
  test.each(["2027-01-15", "2027-02-28", "not-a-date"])("rejects %s", (date) => {
    expect(isMonthStart(date)).toBe(false);
  });

  test("accepts the first day of a month", () => {
    expect(isMonthStart("2027-02-01")).toBe(true);
  });
});

describe("isValidPlanName", () => {
  test.each([
    { name: "Nails", expected: true },
    { name: "   ", expected: false },
    { name: "a".repeat(80), expected: true },
    { name: "a".repeat(81), expected: false },
  ])("returns $expected for a $name.length-character name", ({ name, expected }) => {
    expect(isValidPlanName(name)).toBe(expected);
  });
});
