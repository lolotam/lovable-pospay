import { describe, expect, test } from "vitest";
import { computeCommission } from "./compute-commission";
import type { PlanRules, SalesLine, ServiceOverrideRow } from "./plan";

const PERIOD_START = new Date("2027-03-01T00:00:00Z");

function sales(...amounts: bigint[]): SalesLine[] {
  return amounts.map((netMills, index) => ({
    sessionId: `session-${index + 1}`,
    occurredAt: new Date(PERIOD_START.getTime() + index * 60_000),
    netMills,
  }));
}

function sessionSales(count: number, netMills: bigint): SalesLine[] {
  return Array.from({ length: count }, (_, index) => ({
    sessionId: `session-${index + 1}`,
    occurredAt: new Date(PERIOD_START.getTime() + index * 60_000),
    netMills,
  }));
}

const EXCESS_BRACKETS: PlanRules = {
  baseRateBp: null,
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
const THREE_BRACKETS: PlanRules = {
  baseRateBp: null,
  baseFixedMills: null,
  tierSchedule: {
    accumulator: "sales_amount",
    mode: "excess",
    thresholdKind: "fixed",
    tiers: [
      { rateBp: 500n, threshold: { kind: "fixed", mills: 1000000n } },
      { rateBp: 800n, threshold: { kind: "fixed", mills: 2000000n } },
      { rateBp: 1200n, threshold: { kind: "fixed", mills: 4000000n } },
    ],
  },
};
const SALARY_BRACKETS: PlanRules = {
  baseRateBp: null,
  baseFixedMills: null,
  tierSchedule: {
    accumulator: "sales_amount",
    mode: "excess",
    thresholdKind: "salary_multiple",
    tiers: [
      { rateBp: 500n, threshold: { kind: "salary_multiple", multipleMilli: 2000n } },
      { rateBp: 1000n, threshold: { kind: "salary_multiple", multipleMilli: 4000n } },
    ],
  },
};
const STEP_UP_TIERS: PlanRules = {
  baseRateBp: null,
  baseFixedMills: null,
  tierSchedule: {
    accumulator: "sales_amount",
    mode: "all_after",
    thresholdKind: "fixed",
    tiers: [
      { rateBp: 500n, threshold: { kind: "fixed", mills: 1000000n } },
      { rateBp: 1000n, threshold: { kind: "fixed", mills: 2000000n } },
    ],
  },
};
const sessionBrackets = (
  tiers: { afterSessions: number; rateBp?: bigint; mills?: bigint }[],
): PlanRules => ({
  baseRateBp: null,
  baseFixedMills: null,
  tierSchedule: {
    accumulator: "session_count",
    mode: "excess",
    tiers: tiers.map((tier) =>
      tier.rateBp !== undefined
        ? {
            afterSessions: tier.afterSessions,
            reward: { kind: "rate_bp" as const, rateBp: tier.rateBp },
          }
        : {
            afterSessions: tier.afterSessions,
            reward: { kind: "fixed_mills" as const, mills: tier.mills! },
          },
    ),
  },
});

describe("computeCommission acceptance criteria (021 new rows)", () => {
  test("row 17: fixed amount per session", () => {
    const rules: PlanRules = { baseRateBp: null, baseFixedMills: 2000n, tierSchedule: null };
    const result = computeCommission(rules, sessionSales(14, 10000n), null);
    expect(result).toMatchObject({ baseFixedMills: 28000n, baseMills: 28000n, totalMills: 28000n });
  });

  test.each([
    {
      name: "row 18: two progressive brackets",
      rules: EXCESS_BRACKETS,
      salary: null,
      lines: sales(3000000n),
      total: 130000n,
    },
    {
      name: "row 19: three brackets, partial top",
      rules: THREE_BRACKETS,
      salary: null,
      lines: sales(4500000n),
      total: 270000n,
    },
    {
      name: "row 20: salary-multiple brackets",
      rules: SALARY_BRACKETS,
      salary: 500000n,
      lines: sales(2500000n),
      total: 100000n,
    },
    {
      name: "row 21a: step-up first bracket",
      rules: STEP_UP_TIERS,
      salary: null,
      lines: sales(1500000n),
      total: 75000n,
    },
    {
      name: "row 21b: step-up second bracket",
      rules: STEP_UP_TIERS,
      salary: null,
      lines: sales(2000000n),
      total: 200000n,
    },
    {
      name: "row 22: session-count rate bracket",
      rules: sessionBrackets([{ afterSessions: 20, rateBp: 1000n }]),
      salary: null,
      lines: sessionSales(25, 30000n),
      total: 15000n,
    },
    {
      name: "row 23: session-count ordering",
      rules: sessionBrackets([{ afterSessions: 2, rateBp: 1000n }]),
      salary: null,
      lines: sales(100000n, 50000n, 30000n),
      total: 3000n,
    },
    {
      name: "row 24: multi-bracket session count",
      rules: sessionBrackets([
        { afterSessions: 20, rateBp: 1000n },
        { afterSessions: 30, rateBp: 1500n },
      ]),
      salary: null,
      lines: sessionSales(35, 30000n),
      total: 52500n,
    },
    {
      name: "row 25: session-count fixed reward",
      rules: sessionBrackets([{ afterSessions: 10, mills: 2500n }]),
      salary: null,
      lines: sessionSales(13, 30000n),
      total: 7500n,
    },
    {
      name: "row 26: fixed per session plus session-count rate",
      rules: {
        baseRateBp: null,
        baseFixedMills: 2000n,
        tierSchedule: {
          accumulator: "session_count" as const,
          mode: "excess" as const,
          tiers: [{ afterSessions: 20, reward: { kind: "rate_bp" as const, rateBp: 1000n } }],
        },
      },
      salary: null,
      lines: sessionSales(25, 30000n),
      total: 65000n,
    },
    {
      name: "row 27: base rate plus progressive brackets",
      rules: { ...EXCESS_BRACKETS, baseRateBp: 200n },
      salary: null,
      lines: sales(3000000n),
      total: 190000n,
    },
  ])("$name", ({ rules, salary, lines, total }) => {
    expect(computeCommission(rules, lines, salary).totalMills).toBe(total);
  });

  test("row 28: per-service override replaces the plan and leaves the threshold", () => {
    const plan: PlanRules = {
      baseRateBp: null,
      baseFixedMills: null,
      tierSchedule: {
        accumulator: "sales_amount",
        mode: "all_after",
        thresholdKind: "fixed",
        tiers: [{ rateBp: 1000n, threshold: { kind: "fixed", mills: 1000000n } }],
      },
    };
    const overrides: ServiceOverrideRow[] = [
      {
        staffId: null,
        serviceId: "service-b",
        effectiveFrom: new Date("2027-01-01T00:00:00Z"),
        override: { kind: "rate_bp", rateBp: 1500n },
      },
    ];
    const lines: SalesLine[] = [
      {
        sessionId: "a1",
        serviceId: "service-a",
        occurredAt: new Date("2027-03-02T10:00:00Z"),
        netMills: 900000n,
      },
      {
        sessionId: "b1",
        serviceId: "service-b",
        occurredAt: new Date("2027-03-02T11:00:00Z"),
        netMills: 200000n,
      },
    ];
    const result = computeCommission(plan, lines, null, overrides);
    expect(result).toMatchObject({
      qualifyingSalesMills: 900000n,
      tierMills: 0n,
      overrideMills: 30000n,
      totalMills: 30000n,
    });
  });

  test("row 29: staff-service override beats the service-wide override", () => {
    const fixed = (mills: bigint) => ({ kind: "fixed_mills" as const, mills });
    const hudaHistory: ServiceOverrideRow[] = [
      {
        id: "1",
        staffId: null,
        serviceId: "service-b",
        effectiveFrom: new Date("2027-01-01T00:00:00Z"),
        override: fixed(3000n),
      },
      {
        id: "2",
        staffId: "huda",
        serviceId: "service-b",
        effectiveFrom: new Date("2027-01-01T00:00:00Z"),
        override: fixed(5000n),
      },
    ];
    const otherHistory: ServiceOverrideRow[] = [hudaHistory[0]!];
    const bLines = (staffPrefix: string): SalesLine[] => [
      {
        sessionId: `${staffPrefix}-1`,
        serviceId: "service-b",
        occurredAt: new Date("2027-03-02T10:00:00Z"),
        netMills: 50000n,
      },
      {
        sessionId: `${staffPrefix}-2`,
        serviceId: "service-b",
        occurredAt: new Date("2027-03-02T11:00:00Z"),
        netMills: 50000n,
      },
    ];
    expect(computeCommission(null, bLines("huda"), null, hudaHistory).overrideMills).toBe(10000n);
    expect(computeCommission(null, bLines("other"), null, otherHistory).overrideMills).toBe(6000n);
  });

  test("row 33: override effective from the save moment, not the month start", () => {
    const plan: PlanRules = { baseRateBp: 1000n, baseFixedMills: null, tierSchedule: null };
    const overrides: ServiceOverrideRow[] = [
      {
        id: "1",
        staffId: "huda",
        serviceId: "service-b",
        effectiveFrom: new Date("2027-03-10T14:00:37Z"),
        override: { kind: "rate_bp", rateBp: 1500n },
      },
    ];
    const lines: SalesLine[] = [
      {
        sessionId: "early",
        serviceId: "service-b",
        occurredAt: new Date("2027-03-10T10:00:00Z"),
        netMills: 100000n,
      },
      {
        sessionId: "late",
        serviceId: "service-b",
        occurredAt: new Date("2027-03-10T15:00:00Z"),
        netMills: 100000n,
      },
    ];
    const result = computeCommission(plan, lines, null, overrides);
    expect(result).toMatchObject({
      qualifyingSalesMills: 100000n,
      baseRateMills: 10000n,
      overrideMills: 15000n,
      totalMills: 25000n,
    });
  });

  test("row 34: no plan still pays matching overrides", () => {
    const overrides: ServiceOverrideRow[] = [
      {
        id: "1",
        staffId: "huda",
        serviceId: "service-b",
        effectiveFrom: new Date("2027-01-01T00:00:00Z"),
        override: { kind: "fixed_mills", mills: 3000n },
      },
    ];
    const lines: SalesLine[] = [
      {
        sessionId: "b1",
        serviceId: "service-b",
        occurredAt: new Date("2027-03-02T10:00:00Z"),
        netMills: 50000n,
      },
      {
        sessionId: "b2",
        serviceId: "service-b",
        occurredAt: new Date("2027-03-02T11:00:00Z"),
        netMills: 50000n,
      },
      {
        sessionId: "a1",
        serviceId: "service-a",
        occurredAt: new Date("2027-03-02T12:00:00Z"),
        netMills: 100000n,
      },
    ];
    const result = computeCommission(null, lines, null, overrides);
    expect(result).toEqual({
      qualifyingSalesMills: 100000n,
      qualifyingSessionCount: 1,
      thresholdMills: null,
      baseRateMills: 0n,
      baseFixedMills: 0n,
      baseMills: 0n,
      tierMills: 0n,
      overrideMills: 6000n,
      overrideSalesMills: 100000n,
      overrideSessionCount: 2,
      totalMills: 6000n,
    });
  });
});
