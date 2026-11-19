/** أسماء محجوزة للنظام، لا تنشر عليها صفحة شركة. */
export const RESERVED_SLUGS: readonly string[] = [
  "admin",
  "app",
  "pos",
  "me",
  "api",
  "s",
  "sign-in",
  "invite",
  "pospay",
  "www",
];
/** يخفض الحروف ويحذف المسافات المحيطة، دون تحويل محتوى غير صالح إلى رابط آخر. */
export function normalizeSlug(input: string): string {
  return input.trim().toLowerCase();
}
/** الرابط من ثلاثة إلى أربعين حرفاً، ويبدأ وينتهي بحرف أو رقم. */
export function validSlug(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/.test(slug) && !RESERVED_SLUGS.includes(slug);
}
