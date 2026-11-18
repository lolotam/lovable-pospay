/** يوحّد رقم العميلة إلى أرقام فقط (8 إلى 15 رقمًا) أو يرفضه. */
export function normalizePhone(value: string): string {
  const digits = value.replace(/[\s\-()+]/g, "");
  if (!/^[0-9]{8,15}$/.test(digits)) throw new Error("INVALID_PHONE");
  return digits;
}
/** يخفي رقم العميلة ويُظهر آخر 3 أرقام فقط (D-43). */
export function maskPhone(phone: string): string {
  return `•••${phone.slice(-3)}`;
}
/** جلسة متأخرة إذا سُجّلت في يوم كويتي لاحق ليوم تنفيذها (D-49). */
export function isLateSession(occurredAt: Date, recordedAt: Date): boolean {
  const day = (d: Date) => new Date(d.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
  return day(occurredAt) < day(recordedAt);
}
