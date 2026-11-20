/** يعرض نص ملّيم من الخادم كمبلغ KWD بثلاث خانات دون أي رقم عائم. */
export function kwdText(mills: string): string {
  const digits = BigInt(mills).toString().padStart(4, "0");
  return `${digits.slice(0, -3)}.${digits.slice(-3)}`;
}

/** يعرض نص نقاط الأساس كنسبة مئوية بخانتين دون أي رقم عائم. */
export function percentText(bp: string): string {
  const value = BigInt(bp);
  const whole = value / 100n;
  const fraction = (value % 100n).toString().padStart(2, "0").replace(/0$/, "");
  return fraction === "0" ? `${whole}` : `${whole}.${fraction}`;
}
