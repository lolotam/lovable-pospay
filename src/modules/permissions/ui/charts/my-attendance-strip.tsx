import { t } from "@/i18n";
import type { AttendanceDay } from "../../contracts";
import { NumberTable } from "./chart-card";
export interface MyAttendanceStripProps {
  data: AttendanceDay[];
}
export function MyAttendanceStrip({ data }: MyAttendanceStripProps) {
  return (
    <section className="mt-6 min-w-0">
      <h2 className="mb-3 text-lg">{t("charts.strip")}</h2>
      <div className="grid grid-cols-7 gap-2 sm:grid-cols-10 lg:grid-cols-15">
        {data.map((d) => {
          const label = d.late ? "charts.late" : d.onTime ? "charts.onTime" : "charts.absent";
          return (
            <div
              key={d.day}
              title={`${d.day}: ${t(label)}`}
              aria-label={`${d.day}: ${t(label)}`}
              className={`flex aspect-square items-center justify-center rounded-md border border-border text-xs tabular-nums ${d.late ? "bg-(--chart-2) text-primary-foreground" : d.onTime ? "bg-(--chart-1) text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              {d.day.slice(8)}
            </div>
          );
        })}
      </div>
      <NumberTable
        caption={t("charts.strip")}
        headers={[t("charts.day"), t("charts.onTime"), t("charts.late"), t("charts.forgotten")]}
        rows={data.map((d) => [d.day, d.onTime, d.late, d.forgotten])}
      />
    </section>
  );
}
