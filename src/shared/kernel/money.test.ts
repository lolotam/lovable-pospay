import { describe, expect, it } from "vitest";
import { formatKwd, parseKwd, percentOf, splitLastTakesRemainder } from "./money";

describe("money (KWD mills)", () => {
  it("parses and formats three decimals exactly", () => {
    expect(parseKwd("1799.000")).toBe(1799000n);
    expect(formatKwd(parseKwd("12.3"))).toBe("12.300");
  });
  it("ق-5: 10.000 over 3 sessions = 3.333, 3.333, 3.334", () => {
    expect(splitLastTakesRemainder(parseKwd("10"), 3).map(formatKwd)).toEqual(["3.333", "3.333", "3.334"]);
  });
  it("ق-3: 10% of 50.000 = 5.000", () => {
    expect(formatKwd(percentOf(parseKwd("50"), 1000n))).toBe("5.000");
  });
});
