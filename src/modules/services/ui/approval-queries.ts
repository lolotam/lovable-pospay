import { queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getManagerPinStatusFn, listFailedPinAttemptsFn } from "../functions/discount.functions";
import {
  listPendingDiscountApprovalsFn,
  requestDiscountApprovalFn,
} from "../functions/approval.functions";

/** يطلب اعتماداً بعدياً عبر دالة الخادم؛ تستعمله صفحتا التسجيل والتعديل (020 B4.1). */
export function useRequestDiscountApproval() {
  return useServerFn(requestDiscountApprovalFn);
}

/** طلبات اعتماد الخصم المعلقة لصندوق المعتمدين وشارة الغلاف؛ استطلاع كل 10 ثوان (020 B4.2). */
export const pendingApprovalsQuery = (companyId: string) =>
  queryOptions({
    queryKey: ["pending-discount-approvals", companyId],
    refetchOnMount: "always",
    refetchInterval: 10_000,
    retry: false,
    queryFn: async () => {
      try {
        return await listPendingDiscountApprovalsFn({ data: { companyId } });
      } catch {
        return null;
      }
    },
  });

/** حالة رقم PIN للمدير الحالي؛ لا يعيد الرمز نفسه أبداً (020 B2). */
export const managerPinStatusQuery = (companyId: string) =>
  queryOptions({
    queryKey: ["manager-pin", companyId],
    refetchOnMount: "always",
    queryFn: async () => {
      try {
        return await getManagerPinStatusFn({ data: { companyId } });
      } catch {
        return null;
      }
    },
  });

/** محاولات PIN الفاشلة؛ RLS يقيدها بالمالك ومعتمدي الفروع (020 B3). */
export const failedPinAttemptsQuery = (companyId: string) =>
  queryOptions({
    queryKey: ["failed-pin-attempts", companyId],
    refetchOnMount: "always",
    queryFn: async () => {
      try {
        return await listFailedPinAttemptsFn({ data: { companyId } });
      } catch {
        return null;
      }
    },
  });
