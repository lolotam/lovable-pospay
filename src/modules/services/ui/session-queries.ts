import { queryOptions } from "@tanstack/react-query";
import {
  getMonthCloseStatusFn,
  listClosedMonthsFn,
  listEditableSessionsFn,
  listSessionEditPickersFn,
  listSessionEditsFn,
} from "../functions/session.functions";

const RECENT_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const pad = (value: number) => String(value).padStart(2, "0");
/** تاريخ اليوم بتوقيت الجهاز YYYY-MM-DD؛ الخادم يفلتر بأيام كل فرع المحلية. */
export const localDateText = (at: Date): string =>
  `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;

/** جلسات فرع المحرر في نطاق زمني؛ الخطأ يعود null فيعرض الصفحة رسالة الوصول. */
export const editableSessionsQuery = (companyId: string, from: string, until: string) =>
  queryOptions({
    queryKey: ["editable-sessions", companyId, from, until],
    refetchOnMount: "always",
    queryFn: async () => {
      try {
        return await listEditableSessionsFn({ data: { companyId, from, until } });
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
      const now = Date.now();
      // يوم زائد بعد اليوم يغطي فرعاً يسبق توقيت الجهاز.
      const from = localDateText(new Date(now - RECENT_DAYS * DAY_MS));
      const until = localDateText(new Date(now + DAY_MS));
      try {
        return await listEditableSessionsFn({ data: { companyId, from, until } });
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

/** خيارات نافذة التعديل؛ الخطأ يعود null فتظهر القوائم فارغة (020 D1). */
export const sessionEditPickersQuery = (companyId: string, enabled: boolean) =>
  queryOptions({
    queryKey: ["session-edit-pickers", companyId],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      try {
        return await listSessionEditPickersFn({ data: { companyId } });
      } catch {
        return null;
      }
    },
  });
