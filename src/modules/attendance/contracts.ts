import { z } from "zod";
import { phoneProofSchema } from "../staff";

export const scanInputSchema = z.object({
  token: z.string().min(10).max(300),
  location: z
    .object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) })
    .nullable(),
  intent: z.enum(["new_shift", "check_out"]).nullable(),
});
export const protectedScanSchema = scanInputSchema.merge(phoneProofSchema);
export type ScanInputDto = z.infer<typeof scanInputSchema>;

export type ScanResultDto =
  | { outcome: "checked_in"; lateMinutes: number; exception: string | null }
  | { outcome: "checked_out"; status: "ok" | "closed_late"; exception: string | null }
  | { outcome: "needs_intent" }
  | { outcome: "rejected"; reason: "invalid_qr" | "not_staff" };

export const branchQrInputSchema = z.object({ branchId: z.string().uuid() });
export type BranchQrDto = { token: string; branchName: string; expiresInSeconds: number };
