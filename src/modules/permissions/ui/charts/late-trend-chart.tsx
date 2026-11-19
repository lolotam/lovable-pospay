import { Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { t } from "@/i18n";
import type { AttendanceDay } from "../../contracts";
import { NumberTable } from "./chart-card";
export interface LateTrendChartProps {
  data: AttendanceDay[];
}
export function LateTrendChart({ data }: LateTrendChartProps) {
  return (
    <>
      <ChartContainer
        className="h-64 aspect-auto"
        config={{ avgLate: { label: t("charts.avgLate"), color: "var(--chart-2)" } }}
      >
        <LineChart accessibilityLayer data={data}>
          <XAxis dataKey="day" tickFormatter={(v) => String(v).slice(5)} />
          <YAxis width={28} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Line
            dataKey="avgLate"
            stroke="var(--color-avgLate)"
            strokeWidth={2}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartContainer>
      <NumberTable
        caption={t("charts.avgLate")}
        headers={[t("charts.day"), t("charts.minutes")]}
        rows={data.map((d) => [d.day, d.avgLate])}
      />
    </>
  );
}
