/** يتحقق هل الخطأ سببه أن تسجيل الدخول غير مُعدّ على هذا السيرفر. */
export function isAuthNotConfigured(e: unknown): boolean {
  if (e instanceof Error) return e.message.includes("AUTH_NOT_CONFIGURED");
  return typeof e === "object" && e !== null && (e as { status?: number }).status === 503;
}
