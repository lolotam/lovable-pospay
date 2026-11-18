import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { loadArea, pageAllowed } from "./area-guard";
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
