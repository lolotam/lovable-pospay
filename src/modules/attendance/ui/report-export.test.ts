import { describe, expect, it } from "vitest";
import type { OperationalReport } from "../report.contracts";
import { buildTable, csvCell, toCsv } from "./report-export";

const data = {
  attendance: [
    {
      id: "1",
      name: "A",
      branch: "B",
      timeZone: "Asia/Kuwait",
      workDate: "2026-11-01",
      checkIn: "2026-11-01T06:00:00Z",
      checkOut: null,
      corrected: null,
      reason: null,
      late: 5,
      status: "open",
    },
    {
      id: "2",
      name: "C",
      branch: "B",
      timeZone: "Asia/Kuwait",
      workDate: "2026-11-01",
      checkIn: "2026-11-01T06:00:00Z",
      checkOut: null,
      corrected: "2026-11-01T14:00:00Z",
      reason: "x",
      late: 0,
      status: "closed",
    },
  ],
  sessions: [],
} satisfies OperationalReport;

describe("report export", () => {
  it("corrected tab exports only corrected rows", () => {
    expect(buildTable(data, "corrected").body.map((r) => r[0])).toEqual(["C"]);
  });
  it("uses each branch time zone for the exported date", () => {
    const [row] = buildTable(data, "attendance").body;
    expect(row?.[3]).toBe(
      new Date("2026-11-01T06:00:00Z").toLocaleString("ar-KW", {
        timeZone: "Asia/Kuwait",
      }),
    );
  });
  it("keeps attendance exports available when a branch timezone is invalid", () => {
    const [first, second] = data.attendance;
    const report = { ...data, attendance: [{ ...first!, timeZone: "Not/AZone" }, second!] };
    const rows = buildTable(report, "attendance").body;
    expect(rows).toHaveLength(2);
    expect(rows[0]?.[3]).toBe(
      new Date(first!.checkIn).toLocaleString("ar-KW", { timeZone: "UTC", timeZoneName: "short" }),
    );
  });
  it("neutralises spreadsheet formulas", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
  });
  it("quotes commas and starts with BOM", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(toCsv({ title: "t", head: ["h"], body: [] }).charCodeAt(0)).toBe(0xfeff);
  });
});
