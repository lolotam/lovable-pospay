/** نتيجة محاولة مسح محفوظة مع بصمة بيانات الطلب. */
export interface CardScanReceipt<Result> {
  fingerprint: string;
  result: Result;
}

/** يقفل معرّف الطلب ويقرأ نتيجته أو يحفظها داخل معاملة المسح. */
export interface CardScanReceipts<Result> {
  lockAndRead(): Promise<CardScanReceipt<Result> | undefined>;
  save(receipt: CardScanReceipt<Result>): Promise<void>;
}
