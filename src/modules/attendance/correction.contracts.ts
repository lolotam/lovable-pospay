import { z } from "zod";

export const correctionScopeSchema = z.object({ companyId: z.string().uuid() });
export const correctionInputSchema = correctionScopeSchema.extend({
  recordId: z.string().uuid(),
  correctedAt: z.string().datetime({ offset: true }),
  reason: z.string().trim().min(1).max(2000),
});
export type CorrectionInput = z.infer<typeof correctionInputSchema>;
export interface ForgottenAttendanceDto {
  id: string;
  staffName: string;
  branchName: string;
  timeZone: string;
  workDate: string;
  checkInAt: string;
  checkOutAt: string | null;
  correctedAt: string | null;
  reason: string | null;
  correctedBy: string | null;
}
