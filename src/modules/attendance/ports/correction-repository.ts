/** السجل الأصلي المحمّل بقفل داخل معاملة التصحيح. */
export interface CorrectionRecord {
  checkInAt: Date;
  checkOutAt: Date | null;
  correctedAt: Date | null;
  status: string;
}
/** منفذ تصحيح الحضور؛ القراءة والحفظ والتدقيق في معاملة واحدة تحت RLS. */
export interface CorrectionRepository {
  /** يثبت صلاحية المدير عند الطلب. */
  authorize(companyId: string): Promise<void>;
  /** يقفل السجل قبل أي تعديل لمنع التصحيح المتزامن. */
  lock(companyId: string, recordId: string): Promise<CorrectionRecord | null>;
  /** يحفظ التصحيح منفصلًا عن الأصل ويكتب أثر التدقيق. */
  save(
    companyId: string,
    recordId: string,
    correctedAt: Date,
    reason: string,
    original: CorrectionRecord,
  ): Promise<void>;
}
