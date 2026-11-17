/** مبلغ بالملّيم (1 دينار كويتي = 1000 ملّيم). لا يُستخدم number للنقود أبداً. */
export type Mills = bigint;

/** عدد الملاليم في الدينار الواحد. */
export const MILLS_PER_KWD = 1000n;

/**
 * يحوّل نصاً مثل "12.345" إلى ملاليم بدقة كاملة.
 * @param value المبلغ بالدينار كنص بثلاث خانات عشرية كحد أقصى
 */
export function parseKwd(value: string): Mills {
  const match = /^(-)?(\d+)(?:\.(\d{1,3}))?$/.exec(value.trim());
  if (!match) throw new Error(`Invalid KWD amount: ${value}`);
  const [, sign, whole, frac = ""] = match;
  const mills = BigInt(whole!) * MILLS_PER_KWD + BigInt(frac.padEnd(3, "0"));
  return sign ? -mills : mills;
}

/** يعرض الملاليم كنص بالدينار بثلاث خانات، مثل "12.345". */
export function formatKwd(mills: Mills): string {
  const negative = mills < 0n;
  const abs = negative ? -mills : mills;
  const whole = abs / MILLS_PER_KWD;
  const frac = (abs % MILLS_PER_KWD).toString().padStart(3, "0");
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

/**
 * يقسم مبلغاً على عدد أجزاء بالتقريب نزولاً، والباقي يذهب للجزء الأخير (مقترح ق-5).
 * @returns قائمة الأجزاء ومجموعها يساوي المبلغ الأصلي
 */
export function splitLastTakesRemainder(total: Mills, parts: number): Mills[] {
  if (!Number.isInteger(parts) || parts <= 0) throw new Error("parts must be a positive integer");
  const n = BigInt(parts);
  const base = total / n;
  const result = Array.from({ length: parts }, () => base);
  result[parts - 1] = base + (total - base * n);
  return result;
}

/**
 * يحسب نسبة مئوية من مبلغ، مقرّبة نزولاً لأقرب ملّيم.
 * @param basisPoints النسبة بنقاط الأساس (10% = 1000)
 */
export function percentOf(amount: Mills, basisPoints: bigint): Mills {
  return (amount * basisPoints) / 10000n;
}
