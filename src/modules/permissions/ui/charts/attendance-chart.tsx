import { Bar, BarChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import { t } from "@/i18n";
import type { AttendanceDay } from "../../contracts";
import { NumberTable } from "./chart-card";
export interface AttendanceChartProps {
  data: AttendanceDay[];
}
export function AttendanceChart({ data }: AttendanceChartProps) {
  const config = {
    onTime: { label: t("charts.onTime"), color: "var(--chart-1)" },
    late: { label: t("charts.late"), color: "var(--chart-2)" },
    forgotten: { label: t("charts.forgotten"), color: "var(--chart-3)" },
  };
  return (
    <>
      <div className="overflow-x-auto">
        <ChartContainer config={config} className="h-64 min-w-80 aspect-auto">
          <BarChart accessibilityLayer data={data} barSize={8}>
            <XAxis dataKey="day" tickFormatter={(v) => String(v).slice(5)} tickMargin={8} />
            <YAxis width={28} allowDecimals={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent className="flex-wrap gap-2" />} />
            {(["onTime", "late", "forgotten"] as const).map((key) => (
              <Bar
                key={key}
                dataKey={key}
                stackId="attendance"
                fill={`var(--color-${key})`}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ChartContainer>
      </div>
      <NumberTable
        caption={t("charts.attendance")}
        headers={[t("charts.day"), t("charts.onTime"), t("charts.late"), t("charts.forgotten")]}
        rows={data.map((d) => [d.day, d.onTime, d.late, d.forgotten])}
      />
    </>
  );
}
