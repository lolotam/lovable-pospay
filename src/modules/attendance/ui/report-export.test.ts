import { describe, expect, it } from "vitest";
import { buildTable, csvCell, toCsv } from "./report-export";

const data = {
  attendance: [
    {
      id: "1",
      name: "A",
      branch: "B",
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
} as never;

describe("report export", () => {
  it("corrected tab exports only corrected rows", () => {
    expect(buildTable(data, "corrected").body.map((r) => r[0])).toEqual(["C"]);
  });
  it("neutralises spreadsheet formulas", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
  });
  it("quotes commas and starts with BOM", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(toCsv({ title: "t", head: ["h"], body: [] }).charCodeAt(0)).toBe(0xfeff);
  });
});

describe("pdf paging", async () => {
  const { chunkRows } = await import("./report-pdf");
  it("splits rows into whole-row pages and keeps an empty page for no data", () => {
    expect(chunkRows([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkRows([], 2)).toEqual([[]]);
  });
});
