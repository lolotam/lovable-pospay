import type { PermissionCompanyRole } from "../domain/permission-admin-types";
import type { OverrideRow } from "../domain/override-states";

/** عضو من دليل الشركة؛ يجمع كل الأدوار التي يحملها في الشركة نفسها. */
export interface PermissionMember {
  userId: string;
  name: string;
  email: string;
  roles: PermissionCompanyRole[];
}
/** صف تجاوز فردي مرتبط بصاحبه. */
export interface MemberOverrideRow extends OverrideRow {
  userId: string;
}
/** منفذ بيانات إدارة الصلاحيات داخل معاملة المستخدم؛ الحفظ يسجل التدقيق مرة واحدة. */
export interface PermissionAdminRepository {
  isOwner(companyId: string): Promise<boolean>;
  readMembers(companyId: string): Promise<PermissionMember[]>;
  readOverrides(companyId: string): Promise<MemberOverrideRow[]>;
  lockTarget(companyId: string, userId: string): Promise<void>;
  replaceOverrides(input: {
    companyId: string;
    userId: string;
    rows: OverrideRow[];
  }): Promise<void>;
}
