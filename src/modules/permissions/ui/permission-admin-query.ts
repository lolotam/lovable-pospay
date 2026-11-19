import { queryOptions } from "@tanstack/react-query";
import { listMemberPermissionsFn } from "../functions/permission-admin.functions";
export const memberPermissionsQuery = (companyId: string) =>
  queryOptions({
    queryKey: ["member-permissions", companyId],
    queryFn: () => listMemberPermissionsFn({ data: { companyId } }),
    staleTime: 0,
    retry: false,
  });
