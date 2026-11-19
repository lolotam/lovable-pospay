import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { t, type MessageKey } from "@/i18n";
export interface ChartCardProps {
  title: MessageKey;
  empty?: boolean;
  children: ReactNode;
}
export function ChartCard({ title, empty, children }: ChartCardProps) {
  return (
    <section className="min-w-0 rounded-lg border border-border bg-card p-4">
      <h2 className="mb-4 text-lg">{t(title)}</h2>
      {empty ? (
        <div className="flex min-h-56 flex-col items-center justify-center gap-4 text-center">
          <p className="text-muted-foreground">{t("charts.empty")}</p>
          <Link to="/app/attendance/reports" className="text-primary underline">
            {t("charts.reports")}
          </Link>
        </div>
      ) : (
        children
      )}
    </section>
  );
}
export interface NumberTableProps {
  headers: string[];
  rows: (string | number | null)[][];
  caption: string;
}
export function NumberTable({ headers, rows, caption }: NumberTableProps) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {headers.map((h) => (
            <th key={h} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((v, j) => (
              <td key={j}>{v ?? "—"}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
