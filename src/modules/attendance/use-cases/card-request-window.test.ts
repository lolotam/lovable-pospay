import { expect, it } from "vitest";
import { cardRequestWindow } from "./card-scan";

it("allows seven real days for a scanner clock five minutes slow", () => {
  const issued = Date.UTC(2026, 10, 18);
  const fiveMinutes = 5 * 60_000;
  const sevenDays = 7 * 24 * 60 * 60_000;
  expect(cardRequestWindow(issued - fiveMinutes, issued + sevenDays - 1)).toBe("valid");
  expect(cardRequestWindow(issued - fiveMinutes, issued + sevenDays)).toBe("expired");
  expect(cardRequestWindow(issued + fiveMinutes, issued)).toBe("valid");
});
