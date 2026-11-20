import { queryOptions } from "@tanstack/react-query";
import { getCommissionPlansFn } from "../functions/plans.functions";
import { getServiceOverridesFn } from "../functions/overrides.functions";
import { getStaffSalariesFn } from "../functions/salaries.functions";

/** شاشة الخطط والإسنادات؛ الخطأ يعود null فيعرض الصفحة رسالة الوصول. */
export const plansQuery = (companyId: string) =>
  queryOptions({
    queryKey: ["commission-plans", companyId],
    refetchOnMount: "always",
    queryFn: async () => {
      try {
        return await getCommissionPlansFn({ data: { companyId } });
      } catch {
        return null;
      }
    },
  });

/** شاشة تجاوزات الخدمات مع قوائم الخدمات والموظفات المسموح بها. */
export const overridesQuery = (companyId: string) =>
  queryOptions({
    queryKey: ["service-overrides", companyId],
    refetchOnMount: "always",
    queryFn: async () => {
      try {
        return await getServiceOverridesFn({ data: { companyId } });
      } catch {
        return null;
      }
    },
  });

/** شاشة رواتب موظفات فروع المستخدم مع السجل الكامل. */
export const salariesQuery = (companyId: string) =>
  queryOptions({
    queryKey: ["staff-salaries", companyId],
    refetchOnMount: "always",
    queryFn: async () => {
      try {
        return await getStaffSalariesFn({ data: { companyId } });
      } catch {
        return null;
      }
    },
  });
