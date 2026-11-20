import { describe, expect, test } from "vitest";
import { loadSalariesScreen, recordSalary } from "./manage-salaries";
import type { SalaryRepository, StoredSalary } from "../ports/salary-repository";

function fakeRepo() {
  const calls: string[] = [];
  const rows: StoredSalary[] = [
    {
      id: "salary-1",
      staffId: "staff-1",
      salaryMills: 450000n,
      effectiveDate: "2027-01-01",
      recordedAt: new Date("2027-01-01T08:00:00Z"),
    },
    {
      id: "salary-2",
      staffId: "staff-1",
      salaryMills: 500000n,
      effectiveDate: "2027-02-15",
      recordedAt: new Date("2027-02-15T08:00:00Z"),
    },
  ];
  const repo: SalaryRepository = {
    salaryOn: async (_companyId, staffId, date) => {
      const matching = rows
        .filter((row) => row.staffId === staffId && row.effectiveDate <= date)
        .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
      return matching[matching.length - 1]?.salaryMills ?? null;
    },
    recordSalary: async (input) => {
      calls.push(`record:${input.staffId}:${input.salaryMills}:${input.effectiveDate}`);
      return { id: "salary-new" };
    },
    listStaffSalaries: async () => {
      calls.push("list");
      return rows;
    },
  };
  return { repo, calls };
}

describe("manage-salaries (021 Q2/S1)", () => {
  test("records a positive effective-dated salary converted to mills", async () => {
    const f = fakeRepo();
    await expect(
      recordSalary(f.repo, {
        staffId: "staff-1",
        salaryKwd: "500.000",
        effectiveDate: "2027-03-01",
      }),
    ).resolves.toEqual({ id: "salary-new" });
    expect(f.calls).toEqual(["record:staff-1:500000:2027-03-01"]);
  });

  test("refuses a zero salary without writing", async () => {
    const f = fakeRepo();
    await expect(
      recordSalary(f.repo, { staffId: "staff-1", salaryKwd: "0.000", effectiveDate: "2027-03-01" }),
    ).rejects.toThrow("INVALID_SALARY");
    expect(f.calls).toEqual([]);
  });

  test("loads the screen with the current salary resolved by effective date", async () => {
    const f = fakeRepo();
    const screen = await loadSalariesScreen(f.repo, [
      { staffId: "staff-1", staffName: "Huda", branchId: "b1", localToday: "2027-03-01" },
      { staffId: "staff-2", staffName: "Salma", branchId: "b1", localToday: "2027-03-01" },
    ]);
    expect(screen.staff[0]).toMatchObject({
      staffName: "Huda",
      currentSalaryMills: "500000",
      currentEffectiveDate: "2027-02-15",
    });
    expect(screen.staff[0]?.history).toHaveLength(2);
    expect(screen.staff[1]).toMatchObject({ currentSalaryMills: null, history: [] });
    expect(f.calls).toEqual(["list"]);
  });

  test("keeps a salary that starts later out of the current salary", async () => {
    const f = fakeRepo();
    const screen = await loadSalariesScreen(f.repo, [
      { staffId: "staff-1", staffName: "Huda", branchId: "b1", localToday: "2027-02-14" },
    ]);
    expect(screen.staff[0]).toMatchObject({
      currentSalaryMills: "450000",
      currentEffectiveDate: "2027-01-01",
    });
    expect(screen.staff[0]?.history).toHaveLength(2);
  });
});
