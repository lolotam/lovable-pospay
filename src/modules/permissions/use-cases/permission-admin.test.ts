import { describe, expect, it } from "vitest";
import { saveOverridesInput } from "../contracts";
import { toStates } from "../domain/override-states";
import type {
  MemberOverrideRow,
  PermissionAdminRepository,
} from "../ports/permission-admin-repository";
import { listMemberPermissions } from "./list-member-permissions";
import { saveMemberOverrides } from "./save-member-overrides";

const companyId = "70000000-0000-4000-8000-000000000001";
function fixture() {
  const state = {
    owner: true,
    rows: [
      { userId: "mona", permission: "attendance.record", effect: "deny" },
    ] as MemberOverrideRow[],
    audits: [] as unknown[],
  };
  const repository: PermissionAdminRepository = {
    isOwner: async () => state.owner,
    readMembers: async () => [
      { userId: "owner", name: "Owner", email: "owner@example.test", roles: ["owner"] },
      {
        userId: "mona",
        name: "Mona",
        email: "mona@example.test",
        roles: ["branch_manager", "reception"],
      },
    ],
    readOverrides: async () => state.rows,
    lockTarget: async () => {},
    replaceOverrides: async ({ userId, rows }) => {
      const before = state.rows.filter((row) => row.userId === userId);
      state.rows = state.rows
        .filter((row) => row.userId !== userId || row.permission === "attendance.record")
        .concat(rows.map((row) => ({ ...row, userId })));
      state.audits.push({ before, after: state.rows.filter((row) => row.userId === userId) });
    },
  };
  return { state, repository };
}
describe("owner permission use cases", () => {
  it("lists multi-role defaults as a union and exposes legacy restrictions", async () => {
    const { repository } = fixture();
    const members = await listMemberPermissions(repository, companyId);
    expect(members[1]?.effective).toEqual([
      "pos.access",
      "reports.view",
      "attendance.correct",
      "staff.manage",
      "services.manage",
      "discounts.manage",
    ]);
    expect(members[1]?.otherRestrictions).toEqual(["attendance.record"]);
    expect(members[0]?.isOwner).toBe(true);
  });
  it("saves an allow, clears defaults, preserves legacy restrictions and writes one audit", async () => {
    const { repository, state } = fixture();
    state.rows.push({ userId: "mona", permission: "reports.view", effect: "deny" });
    const result = await saveMemberOverrides(repository, "owner", {
      companyId,
      userId: "mona",
      overrides: { ...toStates([]), "pos.access": "allow" },
    });
    expect(result.overrides["pos.access"]).toBe("allow");
    expect(result.effective).toContain("reports.view");
    expect(state.rows).toEqual([
      { userId: "mona", permission: "attendance.record", effect: "deny" },
      { userId: "mona", permission: "pos.access", effect: "allow" },
    ]);
    expect(state.audits).toHaveLength(1);
  });
  it("refuses a missing member without writing", async () => {
    const { repository, state } = fixture();
    await expect(
      saveMemberOverrides(repository, "owner", {
        companyId,
        userId: "outsider",
        overrides: toStates([]),
      }),
    ).rejects.toThrow("MEMBER_NOT_FOUND");
    expect(state.audits).toHaveLength(0);
  });
  it.each(["list", "save"])(
    "requires ownership for %s even with delegated permissions",
    async (operation) => {
      const { repository, state } = fixture();
      state.owner = false;
      await expect(
        operation === "list"
          ? listMemberPermissions(repository, companyId)
          : saveMemberOverrides(repository, "manager", {
              companyId,
              userId: "mona",
              overrides: toStates([]),
            }),
      ).rejects.toThrow("FORBIDDEN");
      expect(state.audits).toHaveLength(0);
    },
  );
  it.each([
    ["owner", "other-owner", "OWNER_LOCKED"],
    ["mona", "mona", "SELF_EDIT"],
  ])("rejects target %s", async (userId, actorId, error) => {
    const { repository, state } = fixture();
    await expect(
      saveMemberOverrides(repository, actorId, { companyId, userId, overrides: toStates([]) }),
    ).rejects.toThrow(error);
    expect(state.audits).toHaveLength(0);
  });
  it("rejects permissions.manage in submitted overrides", () => {
    expect(
      saveOverridesInput.safeParse({
        companyId,
        userId: "mona",
        overrides: { ...toStates([]), "permissions.manage": "allow" },
      }).success,
    ).toBe(false);
  });
  it("requires all six editable states", () => {
    expect(
      saveOverridesInput.safeParse({
        companyId,
        userId: "mona",
        overrides: { "pos.access": "allow" },
      }).success,
    ).toBe(false);
  });
});
