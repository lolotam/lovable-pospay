import type { CompanyOverview, OwnOverview, PlatformOverview } from "../domain/session-types";
/** قراءات لوحة التحكم ضمن هوية المستخدم ومعاملة العزل الحالية. */
export interface OverviewReader {
  /** أعداد المنصة؛ غياب الإذن يرفض القراءة. */
  platform(): Promise<PlatformOverview>;
  /** أعداد الشركة في نطاق الفرع المسموح. */
  company(companyId: string, branchId: string | null): Promise<CompanyOverview>;
  /** حالة الموظفة الحالية دون بيانات موظفات أخريات. */
  own(companyId: string): Promise<OwnOverview>;
}
