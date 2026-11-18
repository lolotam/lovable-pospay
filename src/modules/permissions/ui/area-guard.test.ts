import { describe, expect, it } from "vitest";
import { pageAllowed } from "./area-guard";
import type { SessionContextDto } from "../contracts";

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
