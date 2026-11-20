// permission-matrix.test.ts
import { describe, it, expect } from "vitest";
import { effectivePermissions } from "./permission-matrix";

describe("effectivePermissions", () => {
  it("gives the owner every permission and ignores overrides", () => {
    const p = effectivePermissions(["owner"], [{ permission: "pos.access", effect: "deny" }]);
    expect(p).toContain("pos.access");
    expect(p).toContain("permissions.manage");
    expect(p).toHaveLength(9);
  });
  it("gives a branch manager the defaults including sessions.edit (020 D1)", () => {
    expect(effectivePermissions(["branch_manager"], []).sort()).toEqual([
      "attendance.correct",
      "discounts.manage",
      "reports.view",
      "services.manage",
      "sessions.edit",
      "staff.manage",
    ]);
  });
  it("keeps commissions.overrides.manage off for a branch manager by default (021 O4)", () => {
    const p = effectivePermissions(["branch_manager"], []);
    expect(p).not.toContain("commissions.overrides.manage");
    expect(
      effectivePermissions(
        ["branch_manager"],
        [{ permission: "commissions.overrides.manage", effect: "allow" }],
      ),
    ).toContain("commissions.overrides.manage");
  });
  it("adds an allowed permission", () => {
    expect(
      effectivePermissions(["branch_manager"], [{ permission: "pos.access", effect: "allow" }]),
    ).toContain("pos.access");
  });
  it("lets deny win over a default and over an allow", () => {
    const p = effectivePermissions(
      ["branch_manager"],
      [
        { permission: "reports.view", effect: "deny" },
        { permission: "pos.access", effect: "allow" },
        { permission: "pos.access", effect: "deny" },
      ],
    );
    expect(p).not.toContain("reports.view");
    expect(p).not.toContain("pos.access");
  });
  it("gives reception only the reception area and staff nothing", () => {
    expect(effectivePermissions(["reception"], [])).toEqual(["pos.access"]);
    expect(effectivePermissions(["staff"], [])).toEqual([]);
  });
  it("unions every role held in the company, like has_permission", () => {
    expect(effectivePermissions(["staff", "reception", "accountant"], []).sort()).toEqual([
      "pos.access",
      "reports.view",
    ]);
    expect(effectivePermissions(["staff", "owner"], [])).toHaveLength(9);
  });
  it("drops a role-restricted key for a member without its roles even with an allow row", () => {
    expect(
      effectivePermissions(["staff"], [{ permission: "sessions.edit", effect: "allow" }]),
    ).toEqual([]);
    expect(
      effectivePermissions(
        ["accountant"],
        [{ permission: "commissions.overrides.manage", effect: "allow" }],
      ),
    ).toEqual(["reports.view"]);
    expect(
      effectivePermissions(["reception"], [{ permission: "sessions.edit", effect: "allow" }]),
    ).toContain("sessions.edit");
  });
});
