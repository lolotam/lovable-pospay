import type { AttendanceReportRow, OperationalReport } from "../report.contracts";
import { t } from "@/i18n";

export type ReportTab = "attendance" | "corrected" | "services";
export type Table = { title: string; head: string[]; body: string[][] };

const dt = (v: string | null) => (v ? new Date(v).toLocaleString("ar-KW") : "");
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
        t("export.phone"),
        t("export.price"),
        t("reports.lateSession"),
      ],
      body: data.sessions.map((r) => [
        r.name,
        r.service,
        dt(r.occurredAt),
        r.clientName ?? "",
        r.clientPhone ?? "",
        formatMills(r.priceMills),
        r.late ? "✓" : "",
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
      dt(r.checkIn),
      dt(r.checkOut),
      dt(r.corrected),
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
