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
/** جلسة متأخرة إذا سُجّلت بعد يوم تنفيذها بحسب توقيت الفرع (D-49). */
export function isLateSession(occurredAt: Date, recordedAt: Date, timeZone: string): boolean {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return day.format(occurredAt) < day.format(recordedAt);
}
