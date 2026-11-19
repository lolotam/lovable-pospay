import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { t } from "@/i18n";
import type { CompanyChartsDto } from "../../contracts";
import { NumberTable } from "./chart-card";
export interface LateLeadersProps {
  data: CompanyChartsDto["lateLeaders"];
}
export function LateLeaders({ data }: LateLeadersProps) {
  return (
    <>
      <ol className="space-y-3 md:hidden">
        {data.map((d) => (
          <li
            key={d.staffId}
            className="flex min-h-11 items-center justify-between gap-3 border-b border-border py-2"
          >
            <span className="min-w-0 break-words">{d.name}</span>
            <span className="shrink-0 tabular-nums">
              {d.lateMinutes} {t("charts.minutes")}
            </span>
          </li>
        ))}
      </ol>
      <div className="hidden md:block">
        <ChartContainer
          className="h-64 aspect-auto"
          config={{ lateMinutes: { label: t("charts.minutes"), color: "var(--chart-4)" } }}
        >
          <BarChart accessibilityLayer layout="vertical" data={data}>
            <XAxis type="number" />
            <YAxis type="category" dataKey="name" width={70} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="lateMinutes" fill="var(--color-lateMinutes)" isAnimationActive={false} />
          </BarChart>
        </ChartContainer>
      </div>
      <NumberTable
        caption={t("charts.leaders")}
        headers={[t("phone.staffName"), t("charts.minutes")]}
        rows={data.map((d) => [d.name, d.lateMinutes])}
      />
    </>
  );
}
