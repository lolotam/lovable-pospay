/** سجل حضور للتقرير بأوقاته الأصلية قبل تنسيق الاستجابة. */
export interface AttendanceReportRecord {
  id: string;
  name: string;
  branch: string;
  timeZone: string;
  workDate: string;
  checkIn: Date;
  checkOut: Date | null;
  corrected: Date | null;
  reason: string | null;
  late: number;
  status: string;
}
