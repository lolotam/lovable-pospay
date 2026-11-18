import { z } from "zod";
import { phoneProofSchema } from "../staff";

export const scanInputSchema = z.object({
  token: z.string().max(300),
  location: z
    .object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) })
    .nullable(),
  intent: z.enum(["new_shift", "check_out"]).nullable(),
  promptedRecordId: z.string().uuid().optional(),
});
export const protectedScanSchema = scanInputSchema.merge(phoneProofSchema);
export type ScanInputDto = z.infer<typeof scanInputSchema>;

export type ScanResultDto =
  | { outcome: "checked_in"; lateMinutes: number; exception: string | null }
  | { outcome: "checked_out"; status: "ok" | "closed_late"; exception: string | null }
  | { outcome: "needs_intent"; recordId: string }
  | { outcome: "rejected"; reason: "invalid_qr" | "not_staff" | "stale_intent" };

export const branchQrInputSchema = z.object({ branchId: z.string().uuid() });
export function scanQrBranchId(token: string): string | null {
  if (token.length > 300) return null;
  const [branchId, issuedAt, signature, extra] = token.split(".");
  const branch = branchQrInputSchema.safeParse({ branchId });
  return branch.success && issuedAt && /^\d+$/.test(issuedAt) && signature && extra === undefined
    ? branch.data.branchId
    : null;
}

export type BranchQrDto = { token: string; branchName: string; expiresInSeconds: number };
