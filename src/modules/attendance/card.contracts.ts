import { z } from "zod";
export const cardScope = z.object({ companyId: z.string().uuid() });
export const cardStaffInput = cardScope.extend({ staffId: z.string().uuid() });
export const revokeCardInput = cardScope.extend({ cardId: z.string().uuid() });
export const cardTokenInput = z.string().regex(/^[a-f0-9]{48}$/);
export const cardRequestInput = cardScope.extend({
  requestId: z.string().uuid(),
  requestedAt: z.number().int().positive(),
  expectedUserId: z.string().min(1),
});
export type CardRequest = z.infer<typeof cardRequestInput>;
export const cardScanInput = cardRequestInput.extend({
  token: cardTokenInput,
  intent: z.enum(["new_shift", "check_out"]).nullable(),
  promptedRecordId: z.string().uuid().optional(),
});
export type CardScanRequest = z.infer<typeof cardScanInput>;
export interface CardStaff {
  id: string;
  name: string;
  branchId: string;
  branchName: string;
  phone: boolean;
  cardId: string | null;
  canIssue: boolean;
}
export interface CardManagement {
  approvedAt: string | null;
  canApprove: boolean;
  staff: CardStaff[];
}
export interface IssuedCard {
  token: string;
  name: string;
  cardId: string;
}
