import type { AttendanceReportRecord } from "../ports/report-repository";
import type { OperationalReport, ReportTab } from "../report.contracts";

const maximumRows = 2000;

/** يقرأ تبويب التقرير المطلوب ضمن حد الصفوف ويجهز بياناته للعرض. */
export async function readOperationalReport(
  tab: ReportTab,
  read: {
    attendance(limit: number, correctedOnly: boolean): Promise<AttendanceReportRecord[]>;
    sessions(limit: number): Promise<OperationalReport["sessions"]>;
  },
): Promise<OperationalReport | "REPORT_TOO_LARGE"> {
  const attendance =
    tab === "services" ? [] : await read.attendance(maximumRows + 1, tab === "corrected");
  const sessions = tab === "services" ? await read.sessions(maximumRows + 1) : [];
  if (attendance.length + sessions.length > maximumRows) return "REPORT_TOO_LARGE";
  return {
    attendance: attendance.map(({ checkIn, checkOut, corrected, ...record }) => ({
      ...record,
      checkIn: checkIn.toISOString(),
      checkOut: checkOut?.toISOString() ?? null,
      corrected: corrected?.toISOString() ?? null,
    })),
    sessions,
  };
}
