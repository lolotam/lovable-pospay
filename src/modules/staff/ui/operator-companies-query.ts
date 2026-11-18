import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
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

const getOperatorUserId = createServerFn({ method: "GET" }).handler(async () => {
  const { requireUserId } = await import("@/lib/server/session.server");
  try {
    return await requireUserId();
  } catch (error) {
    if (
      isAuthNotConfigured(error) ||
      (error instanceof Error && error.message === "UNAUTHENTICATED")
    )
      return null;
    throw error;
  }
});

export async function preloadOperatorCompanies(queryClient: QueryClient): Promise<void> {
  const userId = await getOperatorUserId();
  if (userId) await queryClient.ensureQueryData(operatorCompaniesQuery(userId));
}
