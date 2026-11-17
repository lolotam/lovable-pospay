import type { GeoPoint, LocationException } from "../domain/geofence";
import type { OpenRecord, ShiftWindow } from "../domain/scan-decision";

/** بيانات الفرع اللازمة للمسح. */
export interface BranchInfo {
  /** معرّف الشركة. */
  companyId: string;
  /** المنطقة الزمنية. */
  timeZone: string;
  /** موقع الفرع إن وُجد. */
  location: GeoPoint | null;
  /** نصف قطر النطاق بالمتر. */
  geofenceMeters: number;
}

/** سجل حضور جديد. */
export interface NewAttendance {
  /** معرّف السجل. */
  id: string;
  /** معرّف الموظفة. */
  staffId: string;
  /** معرّف الفرع. */
  branchId: string;
  /** الوردية إن وُجدت. */
  shiftId: string | null;
  /** يوم العمل YYYY-MM-DD. */
  workDate: string;
  /** وقت الحضور. */
  checkInAt: Date;
  /** دقائق التأخير. */
  lateMinutes: number;
  /** استثناء الموقع. */
  exception: LocationException | null;
}

/** منفذ تخزين الحضور. كل العمليات تحت RLS للمستخدم الحالي. */
export interface AttendanceRepository {
  /** يقرأ بيانات الفرع. */
  branch(branchId: string): Promise<BranchInfo | null>;
  /** معرّف ملف الموظفة للمستخدم الحالي في الشركة. */
  myStaffId(companyId: string): Promise<string | null>;
  /** السجل المفتوح للموظفة. */
  openRecord(companyId: string, staffId: string): Promise<OpenRecord | null>;
  /** أقرب وردية تبدأ أو جارية حول الوقت المعطى. */
  nextShift(companyId: string, staffId: string, around: Date): Promise<ShiftWindow | null>;
  /** يضيف سجل حضور مفتوح. */
  insertCheckIn(companyId: string, record: NewAttendance): Promise<void>;
  /** يغلق سجلاً بحالة الإغلاق. */
  close(companyId: string, recordId: string, at: Date, status: "ok" | "closed_late", exception: LocationException | null): Promise<void>;
  /** يعلّم السجل كانصراف منسي بدون وقت انصراف (D-32). */
  markForgotten(companyId: string, recordId: string): Promise<void>;
  /** يكتب في سجل التدقيق. */
  audit(companyId: string, action: string, entityId: string, details: Record<string, unknown>): Promise<void>;
}
