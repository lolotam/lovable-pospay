import type { WorkspaceDto } from "../domain/session-types";
import type { PermissionOverride } from "../domain/permission-matrix";
/** مصدر عضويات المستخدم وصلاحياته، دون معرفة التخزين. */
export interface SessionContextRepository {
  /** عضويات المستخدم في الشركات مع اسم الفرع ونوع النشاط. */
  listCompanyWorkspaces(): Promise<Extract<WorkspaceDto, { kind: "company" }>[]>;
  /** هل المستخدم مدير منصة؟ */
  isPlatformAdmin(): Promise<boolean>;
  /** تجاوزات المستخدم في شركة واحدة. */
  listOverrides(companyId: string): Promise<PermissionOverride[]>;
}
