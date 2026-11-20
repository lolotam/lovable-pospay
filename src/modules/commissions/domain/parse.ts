import { MILLS_PER_KWD } from "@/shared/kernel/money";

/**
 * يحل نسبة مئوية نصية إلى نقاط أساس bigint دون أي رقم عائم.
 *
 * @param text النسبة كما أدخلها المستخدم مثل "5" أو "12.5" أو "0.25"
 * @returns نقاط الأساس (12.5% = 1250n)
 * @throws Error("INVALID_PERCENT") عند أي صيغة أخرى
 */
export function parsePercentToBp(text: string): bigint {
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!match) throw new Error("INVALID_PERCENT");
  const [, whole, fraction = ""] = match;
  return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
}

/**
 * يحل مضاعف الراتب النصي إلى ألفية bigint دون أي رقم عائم.
 *
 * @param text المضاعف مثل "2" أو "2.5" أو "3.250"
 * @returns الألفية (2.5× = 2500n)
 * @throws Error("INVALID_MULTIPLE") عند أي صيغة أخرى
 */
export function parseMultipleToMilli(text: string): bigint {
  const match = /^(\d{1,3})(?:\.(\d{1,3}))?$/.exec(text.trim());
  if (!match) throw new Error("INVALID_MULTIPLE");
  const [, whole, fraction = ""] = match;
  return BigInt(whole!) * 1000n + BigInt(fraction.padEnd(3, "0"));
}

/** يحل مبلغ KWD نصياً إلى ملّيم عبر محلل النواة المشترك بلا أرقام عائمة. */
export function parseKwdToMills(text: string): bigint {
  const match = /^(\d{1,12})(?:\.(\d{1,3}))?$/.exec(text.trim());
  if (!match) throw new Error("INVALID_KWD");
  const [, whole, fraction = ""] = match;
  return BigInt(whole!) * MILLS_PER_KWD + BigInt(fraction.padEnd(3, "0"));
}
