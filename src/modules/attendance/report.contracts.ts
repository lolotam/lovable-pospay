import type { SessionReportRow } from "@/modules/services";
import { z } from "zod";
const reportTabSchema = z.enum(["attendance", "corrected", "services"]);
export type ReportTab = z.infer<typeof reportTabSchema>;

export const reportInput = z
  .object({
    companyId: z.string().uuid(),
    tab: reportTabSchema,
    from: z.string().datetime({ offset: true }),
    until: z.string().datetime({ offset: true }),
  })
  .refine((v) => Date.parse(v.until) > Date.parse(v.from), "INVALID_RANGE");
export interface AttendanceReportRow {
  id: string;
  name: string;
  branch: string;
  timeZone: string;
  workDate: string;
  checkIn: string;
  checkOut: string | null;
  corrected: string | null;
  reason: string | null;
  late: number;
  status: string;
}
export interface OperationalReport {
  attendance: AttendanceReportRow[];
  sessions: SessionReportRow[];
}
