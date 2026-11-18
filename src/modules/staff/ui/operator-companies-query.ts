import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { getOperatorUserId } from "../functions/operator-companies.functions";
import { getMyCompanies } from "@/lib/tenancy.functions";
import { isAuthNotConfigured } from "@/lib/auth-errors";
export const operatorCompaniesQuery = (userId: string) =>
  queryOptions({
    queryKey: ["operator-companies", userId],
    refetchOnMount: "always",
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

/**
 * تحميل مسبق غير حاجز: المسارات تستدعيه بـ `void` عمداً حتى لا تنتظر الشبكة قبل عرض الصفحة.
 * لا يرمي أبداً؛ أي فشل يُبتلع لأن الصفحة نفسها تعيد الطلب عبر useQuery وتعرض خطأه.
 */
export async function preloadOperatorCompanies(
  queryClient: QueryClient,
  preloadCompany?: (companyId: string, userId: string) => Promise<unknown>,
): Promise<void> {
  try {
    const userId = await getOperatorUserId();
    if (!userId) return;
    const { companies, error } = await queryClient.ensureQueryData(operatorCompaniesQuery(userId));
    const firstCompany = companies[0];
    if (!error && firstCompany && preloadCompany) await preloadCompany(firstCompany.id, userId);
  } catch {
    // The page can retry a failed preload.
  }
}
