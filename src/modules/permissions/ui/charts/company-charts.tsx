import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { t } from "@/i18n";
import type { ChartRange, CompanyChartsDto, SessionContextDto } from "../../contracts";
import { ChartCard } from "./chart-card";
import { AttendanceChart } from "./attendance-chart";
import { LateTrendChart } from "./late-trend-chart";
import { LateLeaders } from "./late-leaders";
import { RangePicker } from "./range-picker";
import { companyChartsQuery } from "./chart-query";
export interface CompanyChartSetProps {
  data: CompanyChartsDto;
}
export function CompanyChartSet({ data }: CompanyChartSetProps) {
  const empty = !data.attendance.some((d) => d.onTime || d.late || d.forgotten);
  return (
    <div className="grid min-w-0 gap-4 md:grid-cols-2 lg:grid-cols-3">
      <ChartCard title="charts.attendance" empty={empty}>
        <AttendanceChart data={data.attendance} />
      </ChartCard>
      <ChartCard title="charts.avgLate" empty={empty}>
        <LateTrendChart data={data.attendance} />
      </ChartCard>
      <ChartCard title="charts.leaders" empty={!data.lateLeaders.length}>
        <LateLeaders data={data.lateLeaders} />
      </ChartCard>
    </div>
  );
}
export interface CompanyChartsProps {
  context: SessionContextDto;
  range: ChartRange;
  onRange: (r: ChartRange) => void;
}
export function CompanyCharts({ context, range, onRange }: CompanyChartsProps) {
  if (context.active?.kind !== "company" || !context.permissions.includes("reports.view"))
    return null;
  return (
    <CompanyChartsLoaded companyId={context.active.companyId} range={range} onRange={onRange} />
  );
}
function CompanyChartsLoaded({
  companyId,
  range,
  onRange,
}: {
  companyId: string;
  range: ChartRange;
  onRange: (r: ChartRange) => void;
}) {
  const { data, isFetching, error } = useQuery({
    ...companyChartsQuery(companyId, range),
    placeholderData: keepPreviousData,
  });
  return (
    <section className="mt-6" aria-busy={isFetching}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl">{t("charts.attendance")}</h2>
        <RangePicker range={range} onChange={onRange} />
      </div>
      {isFetching && (
        <p role="status" className="mb-2 text-sm text-muted-foreground">
          {t("charts.loading")}
        </p>
      )}
      {error && <p role="alert">{t("charts.failed")}</p>}
      {data && <CompanyChartSet data={data} />}
    </section>
  );
}
