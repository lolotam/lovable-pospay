// workspace.test.ts
import { describe, it, expect } from "vitest";
import { areaForWorkspace, canEnterArea, landingPath, safeRedirectPath } from "./workspace";
import type { WorkspaceDto } from "../contracts";

const company = (role: "owner" | "branch_manager" | "reception" | "staff"): WorkspaceDto => ({
  kind: "company",
  companyId: "40000000-0000-4000-8000-000000000001",
  companyName: "Salon",
  businessType: "salon",
  role,
  branchId: null,
  branchName: null,
});

describe("workspace rules", () => {
  it("maps each workspace to its home area", () => {
    expect(areaForWorkspace({ kind: "platform" })).toBe("admin");
    expect(areaForWorkspace(company("owner"))).toBe("app");
    expect(areaForWorkspace(company("reception"))).toBe("pos");
    expect(areaForWorkspace(company("staff"))).toBe("me");
  });
  it("opens the reception area for a manager only with pos.access", () => {
    expect(canEnterArea(company("branch_manager"), [], "pos")).toBe(false);
    expect(canEnterArea(company("branch_manager"), ["pos.access"], "pos")).toBe(true);
    expect(canEnterArea(company("staff"), [], "app")).toBe(false);
    expect(canEnterArea({ kind: "platform" }, [], "app")).toBe(false);
  });
  it("decides where to land after sign-in", () => {
    expect(landingPath([], null)).toBe("/workspaces");
    expect(landingPath([company("staff")], null)).toBe("/me");
    expect(landingPath([company("owner"), company("staff")], null)).toBe("/workspaces");
    expect(landingPath([company("owner"), company("staff")], company("owner"))).toBe("/app");
  });
  it("accepts only same-origin relative redirect paths", () => {
    expect(safeRedirectPath("/app/services?x=1")).toBe("/app/services?x=1");
    expect(safeRedirectPath("//evil.example")).toBeNull();
    expect(safeRedirectPath("https://evil.example")).toBeNull();
    expect(safeRedirectPath("/\\evil")).toBeNull();
    expect(safeRedirectPath(undefined)).toBeNull();
  });
  it("rejects encoded external redirect tricks", () => {
    expect(safeRedirectPath("/%2fevil.example")).toBeNull();
    expect(safeRedirectPath("/%5cevil.example")).toBeNull();
    expect(safeRedirectPath("/\nevil.example")).toBeNull();
  });
  it("ignores removed remembered workspaces", () => {
    expect(landingPath([company("staff")], company("owner"))).toBe("/me");
    expect(landingPath([], { kind: "platform" })).toBe("/workspaces");
  });
  it("blocks reception when pos.access is denied", () => {
    expect(canEnterArea(company("reception"), [], "pos")).toBe(false);
  });
});
