interface CorrectionReadback {
  records: { id: string; correctedAt: string | null }[];
  error: string | null;
}
export function assertCorrectionReadback(
  data: CorrectionReadback | undefined,
  id: string,
  correctedAt: string,
) {
  if (
    data?.error ||
    !data?.records.some((record) => record.id === id && record.correctedAt === correctedAt)
  ) {
    throw new Error("READBACK_FAILED");
  }
}
