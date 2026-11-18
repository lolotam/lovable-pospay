import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { getOperatorUserId } from "../functions/operator-companies.functions";
import { getMyCompanies } from "@/lib/tenancy.functions";
import { isAuthNotConfigured } from "@/lib/auth-errors";
export const operatorCompaniesQuery = (userId: string) =>
  queryOptions({
    queryKey: ["operator-companies", userId],
    retry: 1,
    queryFn: async () => {
      try {
        return {
          companies: await getMyCompanies({ data: { expectedUserId: userId } }),
          error: null,
        };
      } catch (error) {
        if (isAuthNotConfigured(error))
          return { companies: [], error: "auth.notConfigured" as const };
        if (error instanceof Error && ["UNAUTHENTICATED", "FORBIDDEN"].includes(error.message))
          return { companies: [], error: "attend.signInFirst" as const };
        throw error;
      }
    },
  });

export async function preloadOperatorCompanies(queryClient: QueryClient): Promise<void> {
  try {
    const userId = await getOperatorUserId();
    if (userId) await queryClient.ensureQueryData(operatorCompaniesQuery(userId));
  } catch {
    // The page can retry a failed initial lookup.
  }
}
