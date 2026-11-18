import { queryOptions } from "@tanstack/react-query";
import { getCatalogFn } from "../functions/catalog.functions";

export const catalogQuery = (companyId: string, userId: string) =>
  queryOptions({
    queryKey: ["catalog", userId, companyId],
    queryFn: () => getCatalogFn({ data: { companyId, expectedUserId: userId } }),
    retry: 1,
  });
