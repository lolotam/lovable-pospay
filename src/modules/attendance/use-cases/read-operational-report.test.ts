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

it("bounds one tab without blocking or querying the other tabs", async () => {
  const attendance = vi.fn(async (limit: number) => Array.from({ length: limit }, () => row));
  const sessions = vi.fn(async () => []);
  const read = { attendance, sessions };
  await expect(readOperationalReport("attendance", read)).resolves.toBe("REPORT_TOO_LARGE");
  expect(attendance).toHaveBeenCalledWith(2001, false);
  expect(sessions).not.toHaveBeenCalled();
  await expect(readOperationalReport("services", read)).resolves.toEqual({
    attendance: [],
    sessions: [],
  });
  expect(attendance).toHaveBeenCalledTimes(1);
  expect(sessions).toHaveBeenCalledWith(2001);
});

it("bounds corrected records independently from total attendance", async () => {
  const attendance = vi.fn(async () => [row]);
  const sessions = vi.fn(async () => []);
  await expect(readOperationalReport("corrected", { attendance, sessions })).resolves.toEqual({
    attendance: [row],
    sessions: [],
  });
  expect(attendance).toHaveBeenCalledWith(2001, true);
  expect(sessions).not.toHaveBeenCalled();
});
