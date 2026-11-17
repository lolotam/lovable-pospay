/** منفذ توليد المعرّفات: يُحقن في حالات الاستخدام بدل randomUUID() مباشرة. */
export interface IdGenerator {
  /** يولّد معرّفاً فريداً جديداً. */
  next(): string;
}

/** مولّد المعرّفات الافتراضي، يُستخدم في طبقة الربط فقط. */
export const cryptoIds: IdGenerator = { next: () => crypto.randomUUID() };
