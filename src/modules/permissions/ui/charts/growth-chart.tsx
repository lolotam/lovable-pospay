import { Line, LineChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import { t } from "@/i18n";
import type { GrowthDto } from "../../contracts";
import { ChartCard, NumberTable } from "./chart-card";
export interface GrowthChartProps {
  data: GrowthDto;
}
export function GrowthChart({ data }: GrowthChartProps) {
  return (
    <div className="mt-6">
      <ChartCard title="charts.growth" empty={!data.some((d) => d.companies || d.users)}>
        <ChartContainer
          className="h-64 aspect-auto"
          config={{
            companies: { label: t("charts.companies"), color: "var(--chart-1)" },
            users: { label: t("charts.users"), color: "var(--chart-5)" },
          }}
        >
          <LineChart accessibilityLayer data={data}>
            <XAxis dataKey="week" tickFormatter={(v) => String(v).slice(5)} />
            <YAxis width={28} allowDecimals={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Line dataKey="companies" stroke="var(--color-companies)" isAnimationActive={false} />
            <Line dataKey="users" stroke="var(--color-users)" isAnimationActive={false} />
          </LineChart>
        </ChartContainer>
        <NumberTable
          caption={t("charts.growth")}
          headers={[t("charts.day"), t("charts.companies"), t("charts.users")]}
          rows={data.map((d) => [d.week, d.companies, d.users])}
        />
      </ChartCard>
    </div>
  );
}
