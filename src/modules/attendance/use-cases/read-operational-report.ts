import type { OperationalReport, ReportTab } from "../report.contracts";

const maximumRows = 2000;

export async function readOperationalReport(
  tab: ReportTab,
  read: {
    attendance(limit: number, correctedOnly: boolean): Promise<OperationalReport["attendance"]>;
    sessions(limit: number): Promise<OperationalReport["sessions"]>;
  },
): Promise<OperationalReport | "REPORT_TOO_LARGE"> {
  const attendance =
    tab === "services" ? [] : await read.attendance(maximumRows + 1, tab === "corrected");
  const sessions = tab === "services" ? await read.sessions(maximumRows + 1) : [];
  if (attendance.length + sessions.length > maximumRows) return "REPORT_TOO_LARGE";
  return { attendance, sessions };
}
