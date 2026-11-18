import type { SessionReportRow } from "../contracts";
import { isLateSession } from "../domain/client-phone";
import type { SessionReportRecord } from "../ports/session-repository";

/** يجهز صفوف تقرير الجلسات للعرض ويحسب التأخر بتوقيت الفرع. */
export async function loadSessionReport(
  read: () => Promise<SessionReportRecord[]>,
): Promise<SessionReportRow[]> {
  return (await read()).map(formatSessionReportRow);
}

function formatSessionReportRow(row: SessionReportRecord): SessionReportRow {
  const { recordedAt, occurredAt, priceMills, ...record } = row;
  let timeZone = record.timeZone;
  let late: boolean | null = null;
  try {
    late = isLateSession(occurredAt, recordedAt, timeZone);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    timeZone = "UTC";
  }
  return {
    ...record,
    timeZone,
    occurredAt: occurredAt.toISOString(),
    priceMills: priceMills.toString(),
    late,
  };
}
