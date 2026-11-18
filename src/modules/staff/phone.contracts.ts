import { z } from "zod";

export const phoneScopeSchema = z.object({ companyId: z.string().uuid() });
export const phoneProofSchema = phoneScopeSchema.extend({
  challengeId: z.string().uuid(),
  response: z.object({
    id: z.string().min(1).max(2048),
    rawId: z.string().max(2048),
    type: z.literal("public-key"),
    response: z.object({
      clientDataJSON: z.string().max(16384),
      authenticatorData: z.string().max(16384),
      signature: z.string().max(16384),
      userHandle: z.string().max(2048).optional(),
    }),
    clientExtensionResults: z.record(z.string(), z.unknown()),
    authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional(),
  }),
});
export type PhoneProofInput = z.infer<typeof phoneProofSchema>;
export const unbindSchema = phoneScopeSchema.extend({ userId: z.string().min(1).max(200) });

export interface PhoneStaffOption {
  userId: string;
  displayName: string;
  branchName: string;
  isBound: boolean;
}

export interface PhoneManagementDto {
  canBind: boolean;
  isBound: boolean;
  browserBinding: { companyId: string; companyName: string } | null;
  canManage: boolean;
  staff: PhoneStaffOption[];
}
