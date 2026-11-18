// permission-matrix.ts
import type { CompanyRole, PermissionKey } from "../contracts";

/** تجاوز فردي لصلاحية واحدة: سماح أو منع. */
export interface PermissionOverride {
  permission: PermissionKey;
  effect: "allow" | "deny";
}

const ALL: PermissionKey[] = [
  "pos.access",
  "reports.view",
  "attendance.correct",
  "staff.manage",
  "services.manage",
  "discounts.manage",
  "permissions.manage",
];
const MANAGER: PermissionKey[] = [
  "reports.view",
  "attendance.correct",
  "staff.manage",
  "services.manage",
  "discounts.manage",
];

/** الصلاحيات الافتراضية لكل دور (المواصفة 016، القاعدة R4). */
export const ROLE_DEFAULTS: Record<CompanyRole, readonly PermissionKey[]> = {
  owner: ALL,
  branch_manager: MANAGER,
  reception: ["pos.access"],
  staff: [],
  accountant: ["reports.view"],
  viewer: ["reports.view"],
};

/**
 * يحسب الصلاحيات الفعلية: افتراضيات الدور + السماح − المنع. المنع يغلب دائماً (D-31).
 * المالك لا يتأثر بأي تجاوز.
 * @param role دور العضوية النشطة
 * @param overrides تجاوزات هذا الشخص في هذه الشركة
 */
export function effectivePermissions(
  role: CompanyRole,
  overrides: readonly PermissionOverride[],
): PermissionKey[] {
  if (role === "owner") return [...ALL];
  const denied = new Set(overrides.filter((o) => o.effect === "deny").map((o) => o.permission));
  const granted = new Set<PermissionKey>(ROLE_DEFAULTS[role]);
  for (const o of overrides) if (o.effect === "allow") granted.add(o.permission);
  return ALL.filter((p) => granted.has(p) && !denied.has(p));
}
