import { expect, it, vi } from "vitest";
import { readOperationalReport } from "./read-operational-report";
import type { AttendanceReportRow } from "../report.contracts";

const row: AttendanceReportRow = {
  id: "attendance",
  name: "Fixture",
  branch: "A",
  timeZone: "UTC",
  workDate: "2026-11-18",
  checkIn: "2026-11-18T10:00:00Z",
  checkOut: null,
  corrected: null,
  reason: null,
  late: 0,
  status: "open",
};

it("rejects an over-limit report without reading sessions", async () => {
  const attendance = vi.fn(async (limit: number) => Array.from({ length: limit }, () => row));
  const sessions = vi.fn(async () => []);
  await expect(readOperationalReport({ attendance, sessions })).resolves.toBe("REPORT_TOO_LARGE");
  expect(attendance).toHaveBeenCalledWith(2001);
  expect(sessions).not.toHaveBeenCalled();
});

it("only fetches the remaining allowance plus one detection row", async () => {
  const attendance = vi.fn(async () => [row]);
  const sessions = vi.fn(async () => []);
  await expect(readOperationalReport({ attendance, sessions })).resolves.toEqual({
    attendance: [row],
    sessions: [],
  });
  expect(sessions).toHaveBeenCalledWith(2000);
});
