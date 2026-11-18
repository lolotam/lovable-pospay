import { queryOptions } from "@tanstack/react-query";
import { getMyCompanies } from "@/lib/tenancy.functions";
import { isAuthNotConfigured } from "@/lib/auth-errors";
export const operatorCompaniesQuery = (userId: string) =>
  queryOptions({
    queryKey: ["operator-companies", userId],
    queryFn: async () => {
      try {
        return {
          companies: await getMyCompanies({ data: { expectedUserId: userId } }),
          error: null,
        };
      } catch (e) {
        return {
          companies: [],
          error: isAuthNotConfigured(e)
            ? ("auth.notConfigured" as const)
            : ("attend.signInFirst" as const),
        };
      }
    },
  });
