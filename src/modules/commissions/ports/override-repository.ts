import type { ServiceOverride, ServiceOverrideRow } from "../domain/plan";

/** مدخل حفظ تجاوز خدمة دون أي تاريخ سريان؛ قاعدة البيانات تضبط اللحظة (021 O5). */
export interface SaveServiceOverrideInput {
  serviceId: string;
  staffId: string | null;
  override: ServiceOverride | { kind: "clear" };
}

/** تجاوز خدمة مخزّن كما يُعرض في شاشة التجاوزات، بأسماء الخدمة والموظفة. */
export interface StoredServiceOverride {
  id: string;
  serviceId: string;
  serviceName: string;
  staffId: string | null;
  staffName: string | null;
  effectiveFrom: Date;
  override: ServiceOverride | { kind: "clear" };
}

/**
 * منفذ تجاوزات عمولة الخدمات؛ الكتابة إضافة فقط ولا يقبل التطبيق أي
 * تاريخ سريان، وeffective_from تضبطه قاعدة البيانات لحظة الحفظ (021 O5).
 */
export interface ServiceOverrideRepository {
  /** يحفظ صفاً تجاوز جديداً ويسجل التدقيق في المعاملة نفسها. */
  saveOverride(input: SaveServiceOverrideInput): Promise<{ id: string }>;
  /** يقرأ التجاوزات المعروضة للمستخدم الحالي حسب RLS. */
  listOverrides(): Promise<StoredServiceOverride[]>;
  /**
   * يقرأ تاريخ تجاوزات موظفة واحدة وصفود الخدمات العامة قبل النهاية
   * الحصرية للفترة (أول الشهر التالي بتوقيت فرع الموظفة)، ليحسم المجال
   * كل بند عند وقته (021 O1)؛ تجاوز آخر يوم في الشهر يدخل الحساب.
   */
  overrideHistory(
    companyId: string,
    staffId: string,
    exclusiveEnd: string,
  ): Promise<ServiceOverrideRow[]>;
}
