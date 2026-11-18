import type { AttendanceReportRow, OperationalReport } from "../report.contracts";
import { t } from "@/i18n";

export type ReportTab = "attendance" | "corrected" | "services";
type Table = { title: string; head: string[]; body: string[][] };

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
        t("export.price"),
        t("reports.lateSession"),
      ],
      body: data.sessions.map((r) => [
        r.name,
        r.service,
        dt(r.occurredAt),
        r.clientName ?? "",
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

const esc = (v: string) => v.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** يفتح نسخة قابلة للطباعة كـ PDF من نافذة الطباعة */
export function printPdf(table: Table, rangeLabel: string) {
  const w = window.open("", "_blank");
  if (!w) return;
  const rows = table.body
    .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
    .join("");
  w.document
    .write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${esc(table.title)}</title>
<style>@page{size:A4 landscape;margin:12mm}body{font-family:"IBM Plex Sans Arabic",sans-serif;font-size:11px}
table{border-collapse:collapse;inline-size:100%}th,td{border:1px solid #999;padding:4px;text-align:start}
th{background:#eee;-webkit-print-color-adjust:exact;print-color-adjust:exact}tr{break-inside:avoid}</style></head>
<body><h1>${esc(table.title)}</h1><p>${esc(rangeLabel)}</p><table><thead><tr>${table.head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></body></html>`);
  w.document.close();
  w.focus();
  w.print();
}
