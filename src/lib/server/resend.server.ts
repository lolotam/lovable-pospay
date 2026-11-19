import type { PasswordResetSender } from "./password-recovery.server";
import type { emailOTP } from "better-auth/plugins";

const RESEND_GATEWAY_URL = "https://connector-gateway.lovable.dev/resend/emails";
const RESEND_DIRECT_URL = "https://api.resend.com/emails";
const DEFAULT_SENDER = "PosPay <noreply@pospay.systems>";

interface ResendTransport {
  url: string;
  headers: Record<string, string>;
}

type ResendConfig = { from: string; origin: string } & (
  { transport: ResendTransport } | { apiKey: string; connectionKey: string }
);

interface EmailBody {
  from: string;
  to: string[];
  subject: string;
  text: string;
}

function createGatewayTransport(apiKey: string, connectionKey: string): ResendTransport {
  return {
    url: RESEND_GATEWAY_URL,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-Connection-Api-Key": connectionKey,
    },
  };
}

/** يختار مسار Resend المناسب من المفاتيح المتاحة دون قراءة أي بيانات أخرى. */
export function resolveResendTransport(
  env: NodeJS.ProcessEnv = process.env,
): ResendTransport | undefined {
  const apiKey = env["LOVABLE_API_KEY"];
  const connectionKey = env["RESEND_API_KEY"];
  if (apiKey && connectionKey) return createGatewayTransport(apiKey, connectionKey);
  if (!connectionKey) return undefined;
  return {
    url: RESEND_DIRECT_URL,
    headers: {
      Authorization: `Bearer ${connectionKey}`,
      "Content-Type": "application/json",
      "User-Agent": "PosPay/1.0",
    },
  };
}

/** يتحقق من توفر مسار البريد وعنوان التطبيق اللازمين لرسائل الاستعادة. */
export function isEmailRecoveryConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(resolveResendTransport(env) && env["BETTER_AUTH_URL"]);
}

function senderAddress(): string {
  return process.env["RESEND_FROM"] || DEFAULT_SENDER;
}

function postEmail(
  transport: ResendTransport,
  body: EmailBody,
  idempotencyKey?: string,
): Promise<Response> {
  const headers = idempotencyKey
    ? { ...transport.headers, "Idempotency-Key": idempotencyKey }
    : transport.headers;
  return fetch(transport.url, {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
    headers,
    body: JSON.stringify(body),
  });
}

/** يرسل رابط Better Auth إلى صاحبه فقط، ولا يسجّل الرابط أو بيانات الدخول. */
export function createResendPasswordSender(config: ResendConfig): PasswordResetSender {
  const transport =
    "transport" in config
      ? config.transport
      : createGatewayTransport(config.apiKey, config.connectionKey);
  return async ({ user, url, token }) => {
    const link = new URL(url);
    if (link.origin !== config.origin || !link.pathname.startsWith("/api/auth/reset-password/")) {
      throw new Error("INVALID_RESET_LINK");
    }
    const response = await postEmail(
      transport,
      {
        from: config.from,
        to: [user.email],
        subject: "استعادة كلمة المرور — PosPay",
        text: `PosPay\n\nطلبت استعادة كلمة المرور. افتح الرابط لتعيين كلمة مرور جديدة:\n${url}\n\nالرابط صالح لمدة ساعة ويُستخدم مرة واحدة. لو لم تطلب الاستعادة، تجاهل الرسالة.`,
      },
      `password-reset-${token}`,
    );
    if (!response.ok) {
      // Provider bodies can echo recipients or reset links; never log them.
      throw new Error(`PASSWORD_RESET_DELIVERY_FAILED_${response.status}`);
    }
  };
}

/** لا يفعّل الاستعادة إلا إذا كانت مفاتيح الإرسال وعنوان التطبيق مضبوطة. */
export function getResendPasswordSender(): PasswordResetSender | undefined {
  const transport = resolveResendTransport();
  const baseURL = process.env["BETTER_AUTH_URL"];
  if (!transport || !baseURL) return undefined;
  return createResendPasswordSender({
    origin: new URL(baseURL).origin,
    from: senderAddress(),
    transport,
  });
}

/** يرسل رمزاً للبريد المسجل عبر المسار المضبوط دون تسجيل الرمز. */
export function getResendOtpSender(): Parameters<typeof emailOTP>[0]["sendVerificationOTP"] {
  return async ({ email, otp }) => {
    const transport = resolveResendTransport();
    if (!transport || !process.env["BETTER_AUTH_URL"]) {
      throw new Error("EMAIL_OTP_NOT_CONFIGURED");
    }
    const response = await postEmail(transport, {
      from: senderAddress(),
      to: [email],
      subject: "رمز التحقق — PosPay",
      text: `رمز التحقق الخاص بك: ${otp}\nصالح لمدة 5 دقائق ولمرة واحدة. لا تشاركه مع أي شخص. إذا لم تطلبه، تجاهل الرسالة.`,
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
  const transport = resolveResendTransport();
  if (!transport) return false;
  const response = await postEmail(transport, {
    from: senderAddress(),
    to: [to],
    subject: `دعوة للانضمام إلى ${companyName} — PosPay`,
    text: `تمت دعوتك للانضمام إلى ${companyName} على PosPay.\nافتح الرابط لإنشاء حسابك:\n${url}\n\nالرابط صالح 7 أيام ولمرة واحدة. لو لم تتوقع الدعوة، تجاهل الرسالة.`,
  });
  return response.ok;
}
