/** الأدوار المتاحة في الشركة؛ العقد يتحقق من نفس مجموعة القيم. */
export type PermissionCompanyRole =
  "owner" | "branch_manager" | "reception" | "staff" | "accountant" | "viewer";
/** المفاتيح الستة القابلة للتعديل بواسطة المالك. */
export type EditablePermission =
  | "pos.access"
  | "reports.view"
  | "attendance.correct"
  | "staff.manage"
  | "services.manage"
  | "discounts.manage";
/** الحالة الافتراضية أو السماح أو المنع لكل مفتاح قابل للتعديل. */
export type EditableOverrideStates = Record<EditablePermission, "default" | "allow" | "deny">;
