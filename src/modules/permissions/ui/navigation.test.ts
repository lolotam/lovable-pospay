import { describe, it, expect } from "vitest";
import { tabNavigation, visibleNavigation } from "./navigation";

const paths = (
  area: "admin" | "app" | "pos" | "me",
  perms: import("../contracts").PermissionKey[],
  recording = false,
  role?: import("../contracts").CompanyRole,
) =>
  visibleNavigation(area, perms, recording, role).flatMap((g) =>
    g.children ? g.children.map((c) => c.to) : [g.to],
  );

describe("visibleNavigation", () => {
  it("shows the company page only to owners and before settings", () => {
    const owner = visibleNavigation("app", [], false, "owner").map((item) => item.to);
    expect(owner).toContain("/app/page");
    expect(owner.indexOf("/app/page")).toBeLessThan(owner.indexOf("/app/settings"));
    expect(
      visibleNavigation("app", [], false, "branch_manager").some((item) => item.to === "/app/page"),
    ).toBe(false);
  });
  it("puts owner permissions before settings", () => {
    const items = visibleNavigation("app", ["permissions.manage"], false, "owner");
    expect(items.slice(-2).map((item) => item.to)).toEqual(["/app/permissions", "/app/settings"]);
  });
  it("does not treat an allow override as ownership", () => {
    expect(
      visibleNavigation("app", ["permissions.manage"], false, "branch_manager").some(
        (item) => item.to === "/app/permissions",
      ),
    ).toBe(false);
  });
  it("shows a branch manager only permitted items", () => {
    const p = paths("app", ["reports.view", "staff.manage"]);
    expect(p).toContain("/app/attendance/reports");
    expect(p).toContain("/app/staff/cards");
    expect(p).not.toContain("/app/attendance/corrections");
    expect(p).not.toContain("/app/services");
  });
  it("drops a group whose children are all hidden", () => {
    const groups = visibleNavigation("app", ["reports.view"], false);
    expect(groups.some((g) => g.label === "nav.group.services")).toBe(false);
  });
  it("shows the new services leaves only with their permissions", () => {
    expect(paths("app", ["discounts.manage"])).toContain("/app/services/approvals");
    expect(paths("app", ["discounts.manage"])).not.toContain("/app/services/sessions");
    expect(paths("app", ["sessions.edit"])).toContain("/app/services/sessions");
    expect(paths("app", ["sessions.edit"])).not.toContain("/app/services/approvals");
  });
  it("gates the commissions group by role and its overrides leaf by permission", () => {
    const owner = paths("app", [], false, "owner");
    expect(owner).toContain("/app/commissions/plans");
    expect(owner).toContain("/app/commissions/salaries");
    expect(owner).not.toContain("/app/commissions/overrides");
    const manager = paths("app", ["commissions.overrides.manage"], false, "branch_manager");
    expect(manager).toContain("/app/commissions/plans");
    expect(manager).toContain("/app/commissions/overrides");
    for (const role of ["reception", "staff", "accountant", "viewer"] as const) {
      const others = paths("app", ["reports.view"], false, role);
      expect(others.some((p) => p?.startsWith("/app/commissions") ?? false)).toBe(false);
    }
  });
  it("marks the approvals leaf with the pending-approvals badge", () => {
    const groups = visibleNavigation("app", ["discounts.manage"], false);
    const leaf = groups
      .flatMap((g) => g.children ?? [])
      .find((c) => c.to === "/app/services/approvals");
    expect(leaf?.badge).toBe("pendingApprovals");
  });
  it("hides sessions until recording is available", () => {
    expect(paths("pos", ["pos.access"])).not.toContain("/pos/sessions");
    expect(paths("pos", ["pos.access"], true)).toContain("/pos/sessions");
  });
  it("lists the platform items for the admin area", () => {
    expect(paths("admin", [])).toEqual([
      "/admin",
      "/admin/connectors",
      "/admin/diagnose",
      "/admin/settings",
    ]);
  });
});

describe("tabNavigation", () => {
  const owner: import("../contracts").PermissionKey[] = [
    "pos.access",
    "reports.view",
    "attendance.correct",
    "staff.manage",
    "services.manage",
    "discounts.manage",
  ];
  const ownerTabs = (pathname: string) =>
    tabNavigation(visibleNavigation("app", owner, false), pathname);
  const activeLabels = (pathname: string) =>
    ownerTabs(pathname)
      .filter((tab) => tab.active)
      .map((tab) => tab.label);

  it("keeps the first four sections and opens a group at its first child", () => {
    expect(ownerTabs("/app").map((tab) => tab.to)).toEqual([
      "/app",
      "/app/attendance/reports",
      "/app/staff/cards",
      "/app/services",
    ]);
  });
  it("opens a group at the first child the user may see", () => {
    const groups = visibleNavigation("app", ["attendance.correct"], false);
    expect(tabNavigation(groups, "/app").map((tab) => tab.to)).toEqual([
      "/app",
      "/app/attendance/corrections",
      "/app/settings",
    ]);
  });
  it.each<[string, string, string[]]>([
    ["a child page lights its group", "/app/staff/team", ["nav.group.staff"]],
    ["a leaf lights only on its own path", "/app", ["nav.dashboard"]],
    ["a page outside the first four sections lights nothing", "/app/settings", []],
  ])("%s", (_scenario, pathname, expected) => {
    expect(activeLabels(pathname)).toEqual(expected);
  });
});
