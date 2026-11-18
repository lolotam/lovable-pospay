import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { allowedDestination, loadArea, pageAllowed, signInDestination } from "./area-guard";
import type { SessionContextDto } from "../contracts";

const { getSessionContext } = vi.hoisted(() => ({ getSessionContext: vi.fn() }));
vi.mock("../functions/session-context.functions", () => ({
  getSessionContext,
  selectWorkspace: vi.fn(),
}));

const context: SessionContextDto = {
  user: { id: "user", name: "Mona", email: "mona@example.test" },
  workspaces: [],
  active: {
    kind: "company",
    companyId: "40000000-0000-4000-8000-000000000001",
    companyName: "Salon",
    businessType: "salon",
    role: "branch_manager",
    branchId: null,
    branchName: null,
  },
  permissions: ["staff.manage"],
};
describe("pageAllowed", () => {
  it("refuses reports without reports.view", () => {
    expect(pageAllowed(context, "/app/attendance/reports")).toBe(false);
    expect(
      pageAllowed({ ...context, permissions: ["reports.view"] }, "/app/attendance/reports"),
    ).toBe(true);
  });
  it("refuses reception unless pos.access is granted", () => {
    expect(pageAllowed(context, "/pos/qr")).toBe(false);
    expect(pageAllowed({ ...context, permissions: ["pos.access"] }, "/pos/qr")).toBe(true);
  });
  it("keeps sessions gated and permits team management", () => {
    expect(pageAllowed({ ...context, permissions: ["pos.access"] }, "/pos/sessions")).toBe(false);
    expect(pageAllowed(context, "/app/staff/team")).toBe(true);
  });
});
describe("loadArea", () => {
  it("sends a signed-in user without a workspace to the chooser with the requested path", async () => {
    const cache = new QueryClient();
    getSessionContext.mockResolvedValue({ ...context, active: null });
    await expect(loadArea(cache, "/app/attendance/reports?day=1", "app")).rejects.toMatchObject({
      options: { to: "/workspaces", search: { redirect: "/app/attendance/reports?day=1" } },
    });
  });
});
describe("signInDestination", () => {
  it("keeps the requested path through the chooser when no workspace is active", () => {
    const many = {
      ...context,
      active: null,
      workspaces: [{ kind: "platform" as const }, context.active!],
    };
    expect(signInDestination(many, "/me/attend?t=abc")).toBe(
      `/workspaces?redirect=${encodeURIComponent("/me/attend?t=abc")}`,
    );
    expect(signInDestination(many, undefined)).toBe("/workspaces");
    expect(signInDestination(context, "/app/staff/team")).toBe("/app/staff/team");
  });
});
describe("allowedDestination", () => {
  const staff: SessionContextDto = {
    ...context,
    active: {
      kind: "company",
      companyId: "40000000-0000-4000-8000-000000000001",
      companyName: "Salon",
      businessType: "salon",
      role: "staff",
      branchId: null,
      branchName: null,
    },
    permissions: [],
  };
  it("resolves a legacy bookmark for the active workspace and keeps its query", () => {
    expect(allowedDestination(staff, "/phone?x=1")).toBe("/me/phone?x=1");
    expect(allowedDestination(staff, "/settings")).toBe("/me/settings");
    expect(allowedDestination(context, "/phone?x=1")).toBe("/app/staff/phones?x=1");
  });
  it("opens attendance scanning for any company workspace but not the platform", () => {
    expect(allowedDestination(context, "/attend?t=abc")).toBe("/me/attend?t=abc");
    expect(
      allowedDestination(
        { ...context, active: { kind: "platform" }, permissions: [] },
        "/me/attend?t=abc",
      ),
    ).toBeNull();
  });
});
