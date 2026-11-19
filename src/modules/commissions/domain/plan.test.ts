import { describe, expect, test } from "vitest";
import { isMonthStart, isValidPlanName, validatePlanVersion } from "./plan";
import type { PlanRules } from "./plan";

const validTier: PlanRules = {
  baseRateBp: null,
  tier: {
    mode: "excess",
    rateBp: 500n,
    threshold: { kind: "fixed", mills: 1000n },
  },
};

const missingThreshold = {
  baseRateBp: null,
  tier: { mode: "excess", rateBp: 500n },
} as unknown as PlanRules;

describe("validatePlanVersion", () => {
  test.each([
    { name: "empty plan", rules: { baseRateBp: null, tier: null }, expected: "PLAN_EMPTY" },
    {
      name: "zero base rate",
      rules: { baseRateBp: 0n, tier: null },
      expected: "PLAN_INVALID",
    },
    {
      name: "base rate above 100 percent",
      rules: { baseRateBp: 10001n, tier: null },
      expected: "PLAN_INVALID",
    },
    {
      name: "zero tier rate",
      rules: { ...validTier, tier: { ...validTier.tier!, rateBp: 0n } },
      expected: "PLAN_INVALID",
    },
    {
      name: "tier rate above 100 percent",
      rules: { ...validTier, tier: { ...validTier.tier!, rateBp: 10001n } },
      expected: "PLAN_INVALID",
    },
    {
      name: "negative fixed threshold",
      rules: {
        ...validTier,
        tier: { ...validTier.tier!, threshold: { kind: "fixed" as const, mills: -1n } },
      },
      expected: "PLAN_INVALID",
    },
    {
      name: "zero salary multiple",
      rules: {
        ...validTier,
        tier: {
          ...validTier.tier!,
          threshold: { kind: "salary_multiple" as const, multipleMilli: 0n },
        },
      },
      expected: "PLAN_INVALID",
    },
    {
      name: "fixed threshold above the bigint column",
      rules: {
        ...validTier,
        tier: {
          ...validTier.tier!,
          threshold: { kind: "fixed" as const, mills: 9223372036854775808n },
        },
      },
      expected: "PLAN_INVALID",
    },
    {
      name: "salary multiple above the integer column",
      rules: {
        ...validTier,
        tier: {
          ...validTier.tier!,
          threshold: { kind: "salary_multiple" as const, multipleMilli: 2147483648n },
        },
      },
      expected: "PLAN_INVALID",
    },
    { name: "missing threshold", rules: missingThreshold, expected: "PLAN_INVALID" },
  ])("returns $expected for $name", ({ rules, expected }) => {
    expect(validatePlanVersion(rules)).toBe(expected);
  });

  test.each([
    { name: "base only", rules: { baseRateBp: 100n, tier: null } },
    { name: "tier only", rules: validTier },
    { name: "base and tier", rules: { ...validTier, baseRateBp: 100n } },
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
