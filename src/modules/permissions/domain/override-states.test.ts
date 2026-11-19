import { describe, expect, it } from "vitest";
import { RESTRICTION_KEYS, assertEditableTarget, toRows, toStates } from "./override-states";

describe("editable permission overrides", () => {
  it.each(["default", "allow", "deny"] as const)("round-trips pos.access=%s", (state) => {
    const states = { ...toStates([]).overrides, "pos.access": state };
    expect(toStates(toRows(states, toStates([]).restrictions)).overrides).toEqual(states);
    expect(toRows(states, toStates([]).restrictions)).toEqual(
      state === "default" ? [] : [{ permission: "pos.access", effect: state }],
    );
  });
  it("rejects owner targets", () => {
    expect(() =>
      assertEditableTarget({ actorId: "owner-a", target: { userId: "owner-b", roles: ["owner"] } }),
    ).toThrow("OWNER_LOCKED");
  });
  it("rejects self-edit", () => {
    expect(() =>
      assertEditableTarget({ actorId: "mona", target: { userId: "mona", roles: ["staff"] } }),
    ).toThrow("SELF_EDIT");
  });
  it("never maps permissions.manage or legacy rows into editable states", () => {
    expect(
      toStates([
        { permission: "permissions.manage", effect: "allow" },
        { permission: "attendance.record", effect: "deny" },
      ]).overrides,
    ).toEqual({
      "pos.access": "default",
      "reports.view": "default",
      "attendance.correct": "default",
      "staff.manage": "default",
      "services.manage": "default",
      "discounts.manage": "default",
    });
  });
});

describe("deny-only restriction mapping", () => {
  it.each(RESTRICTION_KEYS)("round-trips default and deny for %s", (key) => {
    for (const state of ["default", "deny"] as const) {
      const restrictions = { ...toStates([]).restrictions, [key]: state };
      const rows = toRows(toStates([]).overrides, restrictions);
      expect(toStates(rows).restrictions).toEqual(restrictions);
      expect(rows).toEqual(state === "default" ? [] : [{ permission: key, effect: "deny" }]);
    }
  });
  it.each(RESTRICTION_KEYS)("ignores legacy allow for %s", (key) => {
    const mapped = toStates([{ permission: key, effect: "allow" }]);
    expect(mapped.restrictions[key]).toBe("default");
    expect(toRows(mapped.overrides, mapped.restrictions)).toEqual([]);
  });
});
