import { describe, expect, test } from "vitest";
import { loadOverridesScreen, saveServiceOverride } from "./manage-overrides";
import type {
  ServiceOverrideRepository,
  StoredServiceOverride,
} from "../ports/override-repository";

function fakeRepo() {
  const calls: string[] = [];
  const rows: StoredServiceOverride[] = [
    {
      id: "override-1",
      serviceId: "service-b",
      serviceName: "Hair B",
      staffId: null,
      staffName: null,
      effectiveFrom: new Date("2027-03-10T14:00:37Z"),
      override: { kind: "fixed_mills", mills: 3000n },
    },
    {
      id: "override-2",
      serviceId: "service-b",
      serviceName: "Hair B",
      staffId: "staff-1",
      staffName: "Huda",
      effectiveFrom: new Date("2027-03-11T09:00:00Z"),
      override: { kind: "clear" },
    },
  ];
  const repo: ServiceOverrideRepository = {
    saveOverride: async (input) => {
      calls.push(`save:${input.serviceId}:${input.staffId ?? "all"}:${input.override.kind}`);
      return { id: "override-new" };
    },
    listOverrides: async () => {
      calls.push("list");
      return rows;
    },
    overrideHistory: async () => [],
  };
  return { repo, calls };
}

describe("manage-overrides (021 O4/O5)", () => {
  test("converts percent and KWD inputs to domain values without floats", async () => {
    const f = fakeRepo();
    await expect(
      saveServiceOverride(f.repo, {
        serviceId: "service-b",
        staffId: null,
        override: { kind: "rate_bp", ratePercent: "12.5" },
      }),
    ).resolves.toEqual({ id: "override-new" });
    await expect(
      saveServiceOverride(f.repo, {
        serviceId: "service-b",
        staffId: "staff-1",
        override: { kind: "fixed_mills", kwd: "3.000" },
      }),
    ).resolves.toEqual({ id: "override-new" });
    await saveServiceOverride(f.repo, {
      serviceId: "service-b",
      staffId: null,
      override: { kind: "clear" },
    });
    expect(f.calls).toEqual([
      "save:service-b:all:rate_bp",
      "save:service-b:staff-1:fixed_mills",
      "save:service-b:all:clear",
    ]);
  });

  test("refuses a percent override above 100% before reaching the database", async () => {
    const f = fakeRepo();
    await expect(
      saveServiceOverride(f.repo, {
        serviceId: "service-b",
        staffId: null,
        override: { kind: "rate_bp", ratePercent: "150" },
      }),
    ).rejects.toThrow("OVERRIDE_INVALID");
    await expect(
      saveServiceOverride(f.repo, {
        serviceId: "service-b",
        staffId: null,
        override: { kind: "rate_bp", ratePercent: "100" },
      }),
    ).resolves.toEqual({ id: "override-new" });
    expect(f.calls).toEqual(["save:service-b:all:rate_bp"]);
  });

  test("serializes the screen with effectiveFrom as the save moment", async () => {
    const f = fakeRepo();
    const screen = await loadOverridesScreen(f.repo, {
      canManage: true,
      services: [{ id: "service-b", name: "Hair B" }],
      staff: [{ id: "staff-1", name: "Huda", branchId: "b1" }],
    });
    expect(screen.canManage).toBe(true);
    expect(screen.overrides[0]).toEqual({
      id: "override-1",
      serviceId: "service-b",
      serviceName: "Hair B",
      staffId: null,
      staffName: null,
      effectiveFrom: "2027-03-10T14:00:37.000Z",
      override: { kind: "fixed_mills", mills: "3000" },
    });
    expect(screen.overrides[1]?.override).toEqual({ kind: "clear" });
    expect(f.calls).toEqual(["list"]);
  });
});
