/** منفذ الوقت: يُحقن في حالات الاستخدام بدل استدعاء Date.now() مباشرة. */
export interface Clock {
  /** الوقت الحالي. */
  now(): Date;
}

/** ساعة النظام الحقيقية، تُستخدم في طبقة الربط فقط. */
export const systemClock: Clock = { now: () => new Date() };
