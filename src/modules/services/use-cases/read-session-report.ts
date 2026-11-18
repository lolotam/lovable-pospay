import type { SessionReportRow } from "../contracts";
import { isLateSession } from "../domain/client-phone";
import type { SessionReportRecord } from "../ports/session-repository";

/** يجهز صفوف تقرير الجلسات للعرض ويحسب التأخر بتوقيت الفرع. */
export async function loadSessionReport(
  read: () => Promise<SessionReportRecord[]>,
): Promise<SessionReportRow[]> {
  return (await read()).map(({ recordedAt, occurredAt, priceMills, ...record }) => ({
    ...record,
    occurredAt: occurredAt.toISOString(),
    priceMills: priceMills.toString(),
    late: isLateSession(occurredAt, recordedAt, record.timeZone),
  }));
}
