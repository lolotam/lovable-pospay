import type { AttendanceReportRow, OperationalReport, ReportTab } from "../report.contracts";
import { t } from "@/i18n";

export type Table = { title: string; head: string[]; body: string[][] };

export function formatReportDate(value: string | null, timeZone: string): string {
  if (!value) return "";
  const date = new Date(value);
  try {
    return date.toLocaleString("ar-KW", { timeZone });
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return date.toLocaleString("ar-KW", { timeZone: "UTC", timeZoneName: "short" });
  }
}
export const formatMills = (m: string) =>
  `${BigInt(m) / 1000n}.${(BigInt(m) % 1000n).toString().padStart(3, "0")}`;

/** يبني جدول التصدير من بيانات التقرير المسموح بها للمستخدم فقط */
export function buildTable(data: OperationalReport, tab: ReportTab): Table {
  if (tab === "services")
    return {
      title: t("reports.services"),
      head: [
        t("export.employee"),
        t("export.service"),
        t("export.time"),
        t("reports.client"),
        t("export.price"),
        t("reports.lateSession"),
      ],
      body: data.sessions.map((r) => [
        r.name,
        r.service,
        formatReportDate(r.occurredAt, r.timeZone),
        r.clientName ?? "",
        formatMills(r.priceMills),
        r.late === null ? t("reports.sessionTimezoneUnknown") : r.late ? "\u2713" : "",
      ]),
    };
  const rows: AttendanceReportRow[] =
    tab === "corrected" ? data.attendance.filter((r) => r.corrected) : data.attendance;
  return {
    title: t(tab === "corrected" ? "reports.corrected" : "reports.attendance"),
    head: [
      t("export.employee"),
      t("export.branch"),
      t("export.workDate"),
      t("reports.in"),
      t("reports.out"),
      t("reports.corrected"),
      t("export.reason"),
      t("reports.late"),
    ],
    body: rows.map((r) => [
      r.name,
      r.branch,
      r.workDate,
      formatReportDate(r.checkIn, r.timeZone),
      formatReportDate(r.checkOut, r.timeZone),
      formatReportDate(r.corrected, r.timeZone),
      r.reason ?? "",
      String(r.late),
    ]),
  };
}

/** يهرب خلية CSV ويمنع حقن الصيغ في برامج الجداول */
export function csvCell(v: string): string {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
export function toCsv(table: Table): string {
  return "\uFEFF" + [table.head, ...table.body].map((r) => r.map(csvCell).join(",")).join("\r\n");
}

export function downloadCsv(table: Table, name: string) {
  const url = URL.createObjectURL(new Blob([toCsv(table)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
