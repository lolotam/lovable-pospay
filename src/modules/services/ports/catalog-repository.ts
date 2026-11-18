import type { Mills } from "@/shared/kernel/money";

/** بيانات الخدمة والإسنادات المستخدمة عند إنشاء سجل أو تحديثه. */
export interface CatalogDetails {
  name: string;
  priceMills: Mills;
  staffIds: string[];
}

/** حالة الخدمة قبل التعديل، والنسخة تمنع الحفظ فوق تعديل أحدث. */
export interface CatalogSnapshot {
  name: string;
  priceMills: Mills;
  version: number;
}

interface CatalogListing {
  services: (CatalogDetails & { id: string; version: number })[];
  staff: { id: string; name: string }[];
}

/** منفذ قراءة الكتالوج المتاح للمستخدم داخل الشركة. */
export interface CatalogReader {
  access(): Promise<{ member: boolean; manager: boolean } | undefined>;
  read(): Promise<CatalogListing>;
}

/** منفذ تعديل الكتالوج والإسنادات وسجل التدقيق داخل معاملة واحدة. */
export interface CatalogWriter {
  canManage(): Promise<boolean>;
  lock(id: string): Promise<CatalogSnapshot | undefined>;
  update(id: string, details: CatalogDetails): Promise<void>;
  create(details: CatalogDetails, requestId?: string): Promise<string | null>;
  /** يتحقق من تطابق إعادة المحاولة مع بيانات الإنشاء الأصلية ونفس منفّذ الطلب. */
  matchesCreation(id: string, details: CatalogDetails): Promise<boolean>;
  replaceAssignments(id: string, staffIds: string[]): Promise<boolean>;
  audit(id: string, previous: CatalogSnapshot | null, details: CatalogDetails): Promise<void>;
}
