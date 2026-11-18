import { queryOptions } from "@tanstack/react-query";
import { getMyCompanies } from "@/lib/tenancy.functions";
import { isAuthNotConfigured } from "@/lib/auth-errors";
export const operatorCompaniesQuery = queryOptions({
  queryKey: ["operator-companies"],
  queryFn: async () => {
    try {
      return { companies: await getMyCompanies(), error: null };
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
