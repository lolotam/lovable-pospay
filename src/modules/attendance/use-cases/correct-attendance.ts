import type { Clock } from "@/shared/kernel/clock";
import type { CorrectionInput } from "../correction.contracts";
import { validateCorrection } from "../domain/correction";
import type { CorrectionRepository } from "../ports/correction-repository";

export async function correctAttendance(
  input: Omit<CorrectionInput, "correctedAt"> & { correctedAt: Date },
  deps: { repo: CorrectionRepository; clock: Clock },
) {
  await deps.repo.authorize(input.companyId);
  const original = await deps.repo.lock(input.companyId, input.recordId);
  if (!original) throw new Error("NOT_FOUND");
  if (original.status !== "forgotten") throw new Error("NOT_FORGOTTEN");
  if (original.correctedAt) throw new Error("ALREADY_CORRECTED");
  const correctedAt = input.correctedAt;
  const error = validateCorrection(original.checkInAt, correctedAt, input.reason, deps.clock.now());
  if (error) throw new Error(error);
  await deps.repo.save(input.companyId, input.recordId, correctedAt, input.reason.trim(), original);
  return {
    id: input.recordId,
    correctedAt: correctedAt.toISOString(),
    reason: input.reason.trim(),
  };
}
