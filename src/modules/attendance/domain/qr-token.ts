/** عمر كود الـ QR المعتمد بالثواني: 60 ثانية (س3). */
export const QR_TTL_SECONDS = 60;

/** محتوى كود الـ QR بعد التحقق. */
export interface QrPayload {
  /** معرّف الفرع. */
  branchId: string;
  /** وقت الإصدار بالثواني. */
  issuedAt: number;
}

/** دالة توقيع HMAC تُحقن من طبقة الربط. */
export type Signer = (message: string) => Promise<string>;

/**
 * يُصدر كود QR موقّعاً للفرع.
 * @returns نص الكود: branchId.issuedAt.signature
 */
export async function issueQrToken(
  branchId: string,
  nowSeconds: number,
  sign: Signer,
): Promise<string> {
  const message = `${branchId}.${nowSeconds}`;
  return `${message}.${await sign(message)}`;
}

/** يقرأ معرّف الفرع من الكود قبل التحقق من التوقيع. */
export function qrBranchId(token: string): string | null {
  const parts = token.split(".");
  return parts.length === 3 && parts[0] ? parts[0] : null;
}

/**
 * يتحقق من توقيع الكود وعمره.
 * @returns محتوى الكود لو صالح، وإلا null
 */
export async function verifyQrToken(
  token: string,
  nowSeconds: number,
  sign: Signer,
): Promise<QrPayload | null> {
  const [branchId, issued, signature] = token.split(".");
  if (!branchId || !issued || !signature) return null;
  const issuedAt = Number(issued);
  if (!Number.isInteger(issuedAt)) return null;
  if (nowSeconds - issuedAt > QR_TTL_SECONDS || issuedAt - nowSeconds > 5) return null;
  const expected = await sign(`${branchId}.${issued}`);
  return constantTimeEqual(expected, signature) ? { branchId, issuedAt } : null;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
