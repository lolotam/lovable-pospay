import { queryOptions } from "@tanstack/react-query";
import {
  getMonthCloseStatusFn,
  listClosedMonthsFn,
  listEditableSessionsFn,
  listSessionEditsFn,
} from "../functions/session.functions";

const RECENT_DAYS = 7;

const instantText = (at: Date): string => at.toISOString().slice(0, 16);

/** جلسات فرع المحرر في نطاق زمني؛ الخطأ يعود null فيعرض الصفحة رسالة الوصول. */
export const editableSessionsQuery = (companyId: string, from: string, until: string) =>
  queryOptions({
    queryKey: ["editable-sessions", companyId, from, until],
    refetchOnMount: "always",
    queryFn: async () => {
      try {
        return await listEditableSessionsFn({
          data: { companyId, from: `${from}T00:00`, until: `${until}T23:59` },
        });
      } catch {
        return null;
      }
    },
  });

/** آخر جلسات الأيام القريبة أسفل نموذج التسجيل في الاستقبال (020 D5). */
export const recentSessionsQuery = (companyId: string) =>
  queryOptions({
    queryKey: ["editable-sessions", companyId, "recent"],
    refetchOnMount: "always",
    queryFn: async () => {
      const until = new Date();
      const from = new Date(until.getTime() - RECENT_DAYS * 24 * 60 * 60 * 1000);
      try {
        return await listEditableSessionsFn({
          data: { companyId, from: instantText(from), until: instantText(until) },
        });
      } catch {
        return null;
      }
    },
  });

/** تاريخ تعديلات جلسة واحدة؛ الخطأ يعود null فيختفي الحوار بهدوء. */
export const sessionEditsQuery = (companyId: string, sessionId: string) =>
  queryOptions({
    queryKey: ["session-edits", companyId, sessionId],
    refetchOnMount: "always",
    queryFn: async () => {
      try {
        return await listSessionEditsFn({ data: { companyId, sessionId } });
      } catch {
        return null;
      }
    },
  });

/** أشهر العمولات المغلقة؛ للعرض فقط ولا يمكن إعادة فتحها (020 D2). */
export const closedMonthsQuery = (companyId: string) =>
  queryOptions({
    queryKey: ["closed-months", companyId],
    refetchOnMount: "always",
    queryFn: async () => {
      try {
        return await listClosedMonthsFn({ data: { companyId } });
      } catch {
        return null;
      }
    },
  });

/** حالة قفل الشهر قبل الإغلاق: أيام متبقية إن كان الشهر غير منتهٍ (020 D2). */
export const monthCloseStatusQuery = (companyId: string, periodMonth: string) =>
  queryOptions({
    queryKey: ["month-close-status", companyId, periodMonth],
    staleTime: 0,
    queryFn: async () => {
      try {
        return await getMonthCloseStatusFn({ data: { companyId, periodMonth } });
      } catch {
        return null;
      }
    },
  });
