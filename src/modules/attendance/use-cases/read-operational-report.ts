import type { OperationalReport } from "../report.contracts";

const maximumRows = 2000;

export async function readOperationalReport(read: {
  attendance(limit: number): Promise<OperationalReport["attendance"]>;
  sessions(limit: number): Promise<OperationalReport["sessions"]>;
}): Promise<OperationalReport | "REPORT_TOO_LARGE"> {
  const attendance = await read.attendance(maximumRows + 1);
  if (attendance.length > maximumRows) return "REPORT_TOO_LARGE";
  const sessions = await read.sessions(maximumRows - attendance.length + 1);
  if (attendance.length + sessions.length > maximumRows) return "REPORT_TOO_LARGE";
  return { attendance, sessions };
}
