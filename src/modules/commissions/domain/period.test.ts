import { describe, expect, test } from "vitest";
import { lastDayOfPeriod, periodStart } from "./period";

describe("commission period dates", () => {
  test.each([
    { year: 2027, month: 1, expected: "2027-01-31" },
    { year: 2027, month: 2, expected: "2027-02-28" },
    { year: 2028, month: 2, expected: "2028-02-29" },
    { year: 2027, month: 4, expected: "2027-04-30" },
  ])("returns the last day for $year-$month", ({ year, month, expected }) => {
    expect(lastDayOfPeriod({ year, month })).toBe(expected);
  });

  test.each([
    { year: 2027, month: 0 },
    { year: 2027, month: 13 },
    { year: 2027.5, month: 1 },
    { year: 0, month: 1 },
  ])("rejects invalid period $year-$month", (period) => {
    expect(() => lastDayOfPeriod(period)).toThrow(RangeError);
    expect(() => periodStart(period)).toThrow(RangeError);
  });

  test("returns the first day without using a clock or timezone", () => {
    expect(periodStart({ year: 2027, month: 2 })).toBe("2027-02-01");
  });
});
