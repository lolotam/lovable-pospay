import type { PasswordResetSender } from "./password-recovery.server";
import type { emailOTP } from "better-auth/plugins";

interface ResendConfig {
  apiKey: string;
  connectionKey: string;
  from: string;
  origin: string;
}

/** يرسل رابط Better Auth إلى صاحبه فقط، ولا يسجّل الرابط أو بيانات الدخول. */
export function createResendPasswordSender(config: ResendConfig): PasswordResetSender {
  return async ({ user, url, token }) => {
    const link = new URL(url);
    if (link.origin !== config.origin || !link.pathname.startsWith("/api/auth/reset-password/")) {
      throw new Error("INVALID_RESET_LINK");
    }
    const response = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        "X-Connection-Api-Key": config.connectionKey,
        "Idempotency-Key": `password-reset-${token}`,
      },
      body: JSON.stringify({
        from: config.from,
        to: [user.email],
        subject: "استعادة كلمة المرور — PosPay",
        text: `PosPay\n\nطلبت استعادة كلمة المرور. افتح الرابط لتعيين كلمة مرور جديدة:\n${url}\n\nالرابط صالح لمدة ساعة ويُستخدم مرة واحدة. لو لم تطلب الاستعادة، تجاهل الرسالة.`,
      }),
    });
    if (!response.ok) {
      // Provider bodies can echo recipients or reset links; never log them.
      throw new Error(`PASSWORD_RESET_DELIVERY_FAILED_${response.status}`);
    }
  };
}

/** لا يفعّل الاستعادة إلا إذا كانت مفاتيح الاتصال وعنوان التطبيق مضبوطة. */
export function getResendPasswordSender(): PasswordResetSender | undefined {
  const apiKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["RESEND_API_KEY"];
  const baseURL = process.env["BETTER_AUTH_URL"];
  if (!apiKey || !connectionKey || !baseURL) return undefined;
  return createResendPasswordSender({
    apiKey,
    connectionKey,
    origin: new URL(baseURL).origin,
    from: process.env["RESEND_FROM"] || "PosPay <noreply@pospay.systems>",
  });
}

/** يرسل رمزاً للبريد المسجل عبر الموصل الرسمي دون تسجيل الرمز. */
export function getResendOtpSender(): Parameters<typeof emailOTP>[0]["sendVerificationOTP"] {
  return async ({ email, otp }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    const connectionKey = process.env["RESEND_API_KEY"];
    if (!apiKey || !connectionKey || !process.env["BETTER_AUTH_URL"])
      throw new Error("EMAIL_OTP_NOT_CONFIGURED");
    const response = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-Connection-Api-Key": connectionKey,
      },
      body: JSON.stringify({
        from: process.env["RESEND_FROM"] || "PosPay <noreply@pospay.systems>",
        to: [email],
        subject: "رمز التحقق — PosPay",
        text: `رمز التحقق الخاص بك: ${otp}\nصالح لمدة 5 دقائق ولمرة واحدة. لا تشاركه مع أي شخص. إذا لم تطلبه، تجاهل الرسالة.`,
      }),
    });
    if (!response.ok) throw new Error(`EMAIL_OTP_DELIVERY_FAILED_${response.status}`);
  };
}

/** يرسل رابط الدعوة لصاحب البريد؛ يرجع false لو البريد غير مضبوط بدل إيقاف الدعوة. */
export async function sendInvitationEmail(
  to: string,
  url: string,
  companyName: string,
): Promise<boolean> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["RESEND_API_KEY"];
  if (!apiKey || !connectionKey) return false;
  const response = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-Connection-Api-Key": connectionKey,
    },
    body: JSON.stringify({
      from: process.env["RESEND_FROM"] || "PosPay <noreply@pospay.systems>",
      to: [to],
      subject: `دعوة للانضمام إلى ${companyName} — PosPay`,
      text: `تمت دعوتك للانضمام إلى ${companyName} على PosPay.\nافتح الرابط لإنشاء حسابك:\n${url}\n\nالرابط صالح 7 أيام ولمرة واحدة. لو لم تتوقع الدعوة، تجاهل الرسالة.`,
    }),
  });
  return response.ok;
}
