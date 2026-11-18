import { describe, it, expect } from "vitest";
import { normalizePhone, maskPhone, isLateSession } from "./client-phone";
describe("client phone (D-43)", () => {
  it("keeps digits only", () => expect(normalizePhone("+965 5555-1234")).toBe("96555551234"));
  it("normalizes an international 00 prefix to the same client key", () =>
    expect(normalizePhone("00965 5555-1234")).toBe(normalizePhone("+965 5555-1234")));
  it("rejects a short number", () => expect(() => normalizePhone("1234")).toThrow("INVALID_PHONE"));
  it("shows only the last 3 digits", () => expect(maskPhone("96555551234")).toBe("•••234"));
});
describe("late session (D-49)", () => {
  it("same Kuwait day is not late", () =>
    expect(
      isLateSession(
        new Date("2026-11-18T06:00:00Z"),
        new Date("2026-11-18T20:00:00Z"),
        "Asia/Kuwait",
      ),
    ).toBe(false));
  it("next Kuwait day is late", () =>
    expect(
      isLateSession(
        new Date("2026-11-18T10:00:00Z"),
        new Date("2026-11-18T21:30:00Z"),
        "Asia/Kuwait",
      ),
    ).toBe(true));
  it("uses the branch calendar when Kuwait and UTC cross midnight at different times", () => {
    const occurred = new Date("2026-11-18T20:30:00Z");
    const recorded = new Date("2026-11-18T21:30:00Z");
    expect(isLateSession(occurred, recorded, "UTC")).toBe(false);
    expect(isLateSession(occurred, recorded, "Asia/Kuwait")).toBe(true);
  });
});
