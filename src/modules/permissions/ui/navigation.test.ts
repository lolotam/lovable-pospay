import { describe, it, expect } from "vitest";
import { visibleNavigation } from "./navigation";

const paths = (
  area: "admin" | "app" | "pos" | "me",
  perms: import("../contracts").PermissionKey[],
  recording = false,
) =>
  visibleNavigation(area, perms, recording).flatMap((g) =>
    g.children ? g.children.map((c) => c.to) : [g.to],
  );

describe("visibleNavigation", () => {
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
