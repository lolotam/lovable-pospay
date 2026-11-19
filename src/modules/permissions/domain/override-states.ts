import type { PermissionCompanyRole, EditableOverrideStates } from "./permission-admin-types";

/** المفاتيح الستة التي يستطيع المالك تعديلها؛ إدارة الصلاحيات ليست قابلة للتفويض. */
export const EDITABLE_PERMISSIONS = [
  "pos.access",
  "reports.view",
  "attendance.correct",
  "staff.manage",
  "services.manage",
  "discounts.manage",
] as const;
/** صف تجاوز مخزّن؛ قد يكون مفتاحاً قديماً خارج المصفوفة الحالية. */
export interface OverrideRow {
  permission: string;
  effect: "allow" | "deny";
}
/** حالات المفاتيح الستة كاملة، بما فيها الحالة الافتراضية. */
export type OverrideStates = EditableOverrideStates;

/** يحول الصفوف إلى حالات كاملة؛ عند وجود صفوف قديمة متعارضة يغلب المنع. */
export function toStates(rows: readonly OverrideRow[]): OverrideStates {
  const states: OverrideStates = {
    "pos.access": "default",
    "reports.view": "default",
    "attendance.correct": "default",
    "staff.manage": "default",
    "services.manage": "default",
    "discounts.manage": "default",
  };
  for (const key of EDITABLE_PERMISSIONS) {
    const matching = rows.filter((row) => row.permission === key);
    if (matching.some((row) => row.effect === "deny")) states[key] = "deny";
    else if (matching.some((row) => row.effect === "allow")) states[key] = "allow";
  }
  return states;
}

/** لا ينتج أي صف للحالة الافتراضية ولا لأي مفتاح غير قابل للتعديل. */
export function toRows(states: OverrideStates): OverrideRow[] {
  return EDITABLE_PERMISSIONS.flatMap((permission) => {
    const effect = states[permission];
    return effect === "default" ? [] : [{ permission, effect }];
  });
}

/** يمنع تعديل المالك أو تعديل الشخص لتجاوزاته الخاصة. */
export function assertEditableTarget(input: {
  actorId: string;
  target: { userId: string; roles: readonly PermissionCompanyRole[] };
}): void {
  if (input.target.roles.includes("owner")) throw new Error("OWNER_LOCKED");
  if (input.actorId === input.target.userId) throw new Error("SELF_EDIT");
}
