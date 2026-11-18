/** يتحقق هل الخطأ سببه أن تسجيل الدخول غير مُعدّ على هذا السيرفر. */
export function isAuthNotConfigured(e: unknown): boolean {
  return (
    (typeof e === "object" && e !== null && "code" in e && e.code === "AUTH_NOT_CONFIGURED") ||
    (e instanceof Error && e.message.includes("AUTH_NOT_CONFIGURED"))
  );
}
