import type { AttendanceDay, ChartRange } from "../contracts";
/** يختار مدى صالحاً، والمدى الافتراضي أربعة عشر يوماً. */
export function parseRange(value: unknown): ChartRange {
  const parsed = typeof value === "string" ? Number(value) : value;
  return parsed === 7 || parsed === 30 ? parsed : 14;
}
/** حساب تاريخ شامل دون الاعتماد على ساعة الخادم أو منطقته الزمنية. */
export function rangeDates(range: ChartRange, today: string) {
  const epoch = Date.parse(`${today}T00:00:00Z`);
  return { from: new Date(epoch - (range - 1) * 86_400_000).toISOString().slice(0, 10), to: today };
}
/** يحافظ على أيام بلا بيانات ويعرضها بأصفار، دون خلط الغياب بالحضور. */
export function padAttendance(
  range: ChartRange,
  today: string,
  rows: AttendanceDay[],
): AttendanceDay[] {
  const { from } = rangeDates(range, today);
  const epoch = Date.parse(`${from}T00:00:00Z`);
  return Array.from({ length: range }, (_, i) => {
    const day = new Date(epoch + i * 86_400_000).toISOString().slice(0, 10);
    return (
      rows.find((row) => row.day === day) ?? {
        day,
        onTime: 0,
        late: 0,
        forgotten: 0,
        avgLate: null,
      }
    );
  });
}
