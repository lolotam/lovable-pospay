import { describe, expect, it } from "vitest";
import { validateCorrection } from "./correction";

describe("D-32 correction", () => {
  it("requires a recorded nonblank reason", () => {
    expect(
      validateCorrection(
        new Date("2026-11-18T06:00Z"),
        new Date("2026-11-18T14:00Z"),
        "  ",
        new Date("2026-11-18T20:00Z"),
      ),
    ).toBe("REASON_REQUIRED");
  });
  it.each([
    ["2026-11-18T05:59Z", "BEFORE_CHECK_IN"],
    ["2026-11-18T20:01Z", "FUTURE_CHECK_OUT"],
    ["invalid", "INVALID_CHECK_OUT"],
  ])("rejects invalid correction time %s", (value, code) => {
    expect(
      validateCorrection(
        new Date("2026-11-18T06:00Z"),
        new Date(value),
        "Forgot to scan",
        new Date("2026-11-18T20:00Z"),
      ),
    ).toBe(code);
  });
});
