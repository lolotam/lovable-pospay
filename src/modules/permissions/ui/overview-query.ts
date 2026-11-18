import { queryOptions } from "@tanstack/react-query";
import {
  getPlatformOverview,
  getCompanyOverview,
  getMyOverview,
} from "../functions/overview.functions";
import { getConnectorsFn } from "@/modules/platform";
export const platformOverviewQuery = queryOptions({
  queryKey: ["platform-overview"],
  queryFn: () => getPlatformOverview(),
});
export const connectorSummaryQuery = queryOptions({
  queryKey: ["connector-summary"],
  queryFn: () => getConnectorsFn(),
});
export const companyOverviewQuery = (companyId: string) =>
  queryOptions({
    queryKey: ["company-overview", companyId],
    queryFn: () => getCompanyOverview({ data: { companyId } }),
  });
export const myOverviewQuery = (companyId: string) =>
  queryOptions({
    queryKey: ["my-overview", companyId],
    queryFn: () => getMyOverview({ data: { companyId } }),
  });
