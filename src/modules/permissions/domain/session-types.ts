/** مساحة العمل المصرح بها للمستخدم؛ مصدر الشكل هو العقد المشترك. */
export type { WorkspaceDto } from "../contracts";
/** حالة الجلسة الموثوقة المستخدمة في قواعد مساحة العمل. */
export type { SessionContextDto, SelectWorkspaceInput } from "../contracts";
/** أعداد لوحة الشركة دون أرقام مالية. */
export interface CompanyOverview {
  present: string;
  exceptions: string;
  staff: string;
}
/** أعداد المنصة المتاحة للمشرف الأعلى فقط. */
export interface PlatformOverview {
  companies: string;
  users: string;
}
/** حالة الموظفة في مساحة عملها الحالية. */
export interface OwnOverview {
  attendance: string | null;
  bound: boolean;
}
