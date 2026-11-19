import { describe, expect, it } from "vitest";
import { parseRange, rangeDates, padAttendance } from "./chart-range";
describe("dashboard ranges", () => {
  it.each([7, 14, 30] as const)("keeps %i inclusive days across months", (range) => {
    expect(rangeDates(range, "2026-03-02")).toEqual({
      from: { 7: "2026-02-24", 14: "2026-02-17", 30: "2026-02-01" }[range],
      to: "2026-03-02",
    });
  });
  it.each([undefined, "bad", 0, 13, 31])("defaults invalid input to 14", (input) => {
    expect(parseRange(input)).toBe(14);
  });
  it("pads missing days without changing recorded numbers", () => {
    const days = padAttendance(7, "2026-03-02", [
      { day: "2026-03-01", onTime: 2, late: 1, forgotten: 1, avgLate: 12 },
    ]);
    expect(days).toHaveLength(7);
    expect(days[0]).toEqual({ day: "2026-02-24", onTime: 0, late: 0, forgotten: 0, avgLate: null });
    expect(days[5]?.late).toBe(1);
  });
});
