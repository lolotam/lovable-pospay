import type {
  EditablePermission,
  PermissionCompanyRole,
  EditableOverrideStates,
  RestrictionStates,
} from "./permission-admin-types";

/** المفاتيح الثمانية التي يستطيع المالك تعديلها؛ إدارة الصلاحيات ليست قابلة للتفويض. */
export const EDITABLE_PERMISSIONS = [
  "pos.access",
  "reports.view",
  "attendance.correct",
  "staff.manage",
  "services.manage",
  "discounts.manage",
  "sessions.edit",
  "commissions.overrides.manage",
] as const;
/** القيود الخمسة لا تقبل السماح، والمفاتيح المدارة تجمع المجموعتين. */
export const RESTRICTION_KEYS = [
  "attendance.record",
  "attendance.manage_devices",
  "attendance.manage_cards",
  "sessions.record",
  "reports.read",
] as const;
export const MANAGED_KEYS = [...EDITABLE_PERMISSIONS, ...RESTRICTION_KEYS] as const;
/**
 * الأدوار التي يسري عليها كل مفتاح قابل للتعديل؛ تخفي الصفحة المفتاح عن عضو
 * بلا أي دور من أدواره، وترفض الحفظ بحالة غير افتراضية له (020 D1، 021 O4).
 */
export const PERMISSION_ROLES: Partial<
  Record<EditablePermission, readonly PermissionCompanyRole[]>
> = {
  "sessions.edit": ["branch_manager", "reception"],
  "commissions.overrides.manage": ["branch_manager"],
};

/**
 * يحدد هل المفتاح قابل للتطبيق على عضو بأدوار معينة؛ المفتاح بلا قيود أدوار يسري على الجميع.
 *
 * @param permission المفتاح المطلوب فحصه
 * @param roles أدوار العضو في الشركة
 * @returns true عندما يُسمح بعرض المفتاح أو تخزين حالة غير افتراضية له
 */
export function permissionApplicable(
  permission: string,
  roles: readonly PermissionCompanyRole[],
): boolean {
  const allowed = PERMISSION_ROLES[permission as EditablePermission];
  return !allowed || allowed.some((role) => roles.includes(role));
}
/** صف تجاوز مخزّن؛ قد يكون مفتاحاً قديماً خارج المصفوفة الحالية. */
export interface OverrideRow {
  permission: string;
  effect: "allow" | "deny";
}
/** حالات المفاتيح الستة كاملة، بما فيها الحالة الافتراضية. */
export type OverrideStates = EditableOverrideStates;

/** يحول الصفوف إلى حالات كاملة؛ عند وجود صفوف قديمة متعارضة يغلب المنع. */
export function toStates(rows: readonly OverrideRow[]): {
  overrides: OverrideStates;
  restrictions: RestrictionStates;
} {
  const states: OverrideStates = {
    "pos.access": "default",
    "reports.view": "default",
    "attendance.correct": "default",
    "staff.manage": "default",
    "services.manage": "default",
    "discounts.manage": "default",
    "sessions.edit": "default",
    "commissions.overrides.manage": "default",
  };
  for (const key of EDITABLE_PERMISSIONS) {
    const matching = rows.filter((row) => row.permission === key);
    if (matching.some((row) => row.effect === "deny")) states[key] = "deny";
    else if (matching.some((row) => row.effect === "allow")) states[key] = "allow";
  }
  const restrictions: RestrictionStates = {
    "attendance.record": "default",
    "attendance.manage_devices": "default",
    "attendance.manage_cards": "default",
    "sessions.record": "default",
    "reports.read": "default",
  };
  for (const key of RESTRICTION_KEYS) {
    if (rows.some((row) => row.permission === key && row.effect === "deny"))
      restrictions[key] = "deny";
  }
  return { overrides: states, restrictions };
}

/** لا ينتج أي صف للحالة الافتراضية ولا لأي مفتاح غير قابل للتعديل. */
export function toRows(states: OverrideStates, restrictions: RestrictionStates): OverrideRow[] {
  const rows: OverrideRow[] = EDITABLE_PERMISSIONS.flatMap((permission) => {
    const effect = states[permission];
    return effect === "default" ? [] : [{ permission, effect }];
  });
  return rows.concat(
    RESTRICTION_KEYS.flatMap((permission) =>
      restrictions[permission] === "deny" ? [{ permission, effect: "deny" as const }] : [],
    ),
  );
}

/** يمنع تعديل المالك أو تعديل الشخص لتجاوزاته الخاصة. */
export function assertEditableTarget(input: {
  actorId: string;
  target: { userId: string; roles: readonly PermissionCompanyRole[] };
}): void {
  if (input.target.roles.includes("owner")) throw new Error("OWNER_LOCKED");
  if (input.actorId === input.target.userId) throw new Error("SELF_EDIT");
}
