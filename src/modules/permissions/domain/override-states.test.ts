import { describe, expect, it } from "vitest";
import { assertEditableTarget, toRows, toStates } from "./override-states";

describe("editable permission overrides", () => {
  it.each(["default", "allow", "deny"] as const)("round-trips pos.access=%s", (state) => {
    const states = { ...toStates([]), "pos.access": state };
    expect(toStates(toRows(states))).toEqual(states);
    expect(toRows(states)).toEqual(
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
      ]),
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
