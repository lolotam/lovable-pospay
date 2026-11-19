import { describe, expect, test } from "vitest";
import { computeCommission } from "./compute-commission";
import type { PlanRules, SalesLine } from "./plan";

const HAIR_PLAN: PlanRules = {
  baseRateBp: null,
  tier: {
    mode: "excess",
    rateBp: 500n,
    threshold: { kind: "salary_multiple", multipleMilli: 2000n },
  },
};
const NAILS_PLAN: PlanRules = {
  baseRateBp: null,
  tier: {
    mode: "all_after",
    rateBp: 1000n,
    threshold: { kind: "salary_multiple", multipleMilli: 3000n },
  },
};
const LASHES_PLAN: PlanRules = {
  baseRateBp: null,
  tier: {
    mode: "excess",
    rateBp: 2000n,
    threshold: { kind: "fixed", mills: 5000000n },
  },
};
const MASSAGE_PLAN: PlanRules = { baseRateBp: 100n, tier: null };
const BASE_AND_HAIR_PLAN: PlanRules = { ...HAIR_PLAN, baseRateBp: 100n };

function sales(...amounts: bigint[]): SalesLine[] {
  return amounts.map((netMills, index) => ({ sessionId: `session-${index + 1}`, netMills }));
}

const acceptanceRows = [
  { row: "1", rules: HAIR_PLAN, salary: 500000n, lines: sales(1000000n), total: 0n },
  { row: "2", rules: HAIR_PLAN, salary: 500000n, lines: sales(999999n), total: 0n },
  {
    row: "3",
    rules: HAIR_PLAN,
    salary: 500000n,
    lines: sales(1000000n, 600000n),
    total: 30000n,
  },
  { row: "4", rules: HAIR_PLAN, salary: 500000n, lines: sales(1000019n), total: 0n },
  { row: "5", rules: HAIR_PLAN, salary: 500000n, lines: sales(1000020n), total: 1n },
  { row: "6", rules: NAILS_PLAN, salary: 600000n, lines: sales(1799999n), total: 0n },
  {
    row: "7",
    rules: NAILS_PLAN,
    salary: 600000n,
    lines: sales(900000n, 900000n),
    total: 180000n,
  },
  { row: "8", rules: NAILS_PLAN, salary: 600000n, lines: sales(2500000n), total: 250000n },
  { row: "9", rules: LASHES_PLAN, salary: null, lines: sales(5000000n), total: 0n },
  { row: "10", rules: LASHES_PLAN, salary: null, lines: sales(6250000n), total: 250000n },
  {
    row: "11",
    rules: MASSAGE_PLAN,
    salary: null,
    lines: sales(30000n, 45000n, 25000n),
    total: 1000n,
  },
  {
    row: "11b",
    rules: MASSAGE_PLAN,
    salary: null,
    lines: sales(12345n, 7655n),
    total: 200n,
  },
  {
    row: "12",
    rules: BASE_AND_HAIR_PLAN,
    salary: 500000n,
    lines: sales(1000000n, 600000n),
    total: 46000n,
  },
  { row: "15", rules: LASHES_PLAN, salary: null, lines: [], total: 0n },
];

describe("computeCommission acceptance criteria", () => {
  test.each(acceptanceRows)("acceptance row $row", ({ rules, salary, lines, total }) => {
    const result = computeCommission(rules, lines, salary);
    expect(result.totalMills).toBe(total);
    expect(result.qualifyingSalesMills).toBe(lines.reduce((sum, line) => sum + line.netMills, 0n));
    expect(result.totalMills).toBe(result.baseMills + result.tierMills);
  });

  test("reports the resolved threshold and separate period components", () => {
    expect(computeCommission(BASE_AND_HAIR_PLAN, sales(1600000n), 500000n)).toEqual({
      qualifyingSalesMills: 1600000n,
      thresholdMills: 1000000n,
      baseMills: 16000n,
      tierMills: 30000n,
      totalMills: 46000n,
    });
  });

  test("requires salary for a salary-linked tier", () => {
    expect(() => computeCommission(HAIR_PLAN, sales(1600000n), null)).toThrowError(
      expect.objectContaining({ code: "SALARY_REQUIRED" }),
    );
  });

  test("rejects a negative sales line", () => {
    expect(() => computeCommission(MASSAGE_PLAN, sales(1000n, -1n), null)).toThrowError(
      expect.objectContaining({ code: "INVALID_LINE" }),
    );
  });
});
