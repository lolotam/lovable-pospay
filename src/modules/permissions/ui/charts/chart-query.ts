import { queryOptions } from "@tanstack/react-query";
import {
  getCompanyChartsFn,
  getMyAttendanceStripFn,
  getPlatformGrowthFn,
} from "../../functions/charts.functions";
import type { ChartRange } from "../../contracts";
export const companyChartsQuery = (companyId: string, range: ChartRange) =>
  queryOptions({
    queryKey: ["company-charts", companyId, range],
    queryFn: () => getCompanyChartsFn({ data: { companyId, range } }),
  });
export const myStripQuery = (companyId: string) =>
  queryOptions({ queryKey: ["my-strip", companyId], queryFn: () => getMyAttendanceStripFn() });
export const growthQuery = queryOptions({
  queryKey: ["platform-growth"],
  queryFn: () => getPlatformGrowthFn(),
});
