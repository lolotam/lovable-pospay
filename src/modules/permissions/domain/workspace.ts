// workspace.ts
import type { Area, PermissionKey, WorkspaceDto } from "../contracts";

/** المنطقة الرئيسية لمساحة العمل (R3). */
export function areaForWorkspace(ws: WorkspaceDto): Area {
  if (ws.kind === "platform") return "admin";
  if (ws.role === "reception") return "pos";
  if (ws.role === "staff") return "me";
  return "app";
}

/** هل تسمح مساحة العمل النشطة بدخول هذه المنطقة؟ الاستقبال يُفتح أيضاً بصلاحية pos.access. */
export function canEnterArea(
  ws: WorkspaceDto,
  permissions: readonly PermissionKey[],
  area: Area,
): boolean {
  if (area === "pos") return ws.kind === "company" && permissions.includes("pos.access");
  return areaForWorkspace(ws) === area;
}

/** وجهة المستخدم بعد الدخول (R2): مساحة واحدة تُفتح مباشرة، غير ذلك صفحة الاختيار. */
export function landingPath(
  workspaces: readonly WorkspaceDto[],
  active: WorkspaceDto | null,
): string {
  const target =
    workspaces.find((ws) => sameWorkspace(ws, active)) ??
    (workspaces.length === 1 ? workspaces[0] : null);
  return target ? `/${areaForWorkspace(target)}` : "/workspaces";
}

/** يقبل مساراً نسبياً داخل الموقع فقط، ويرفض أي عنوان خارجي. */
export function safeRedirectPath(value: string | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\"))
    return null;
  if (/[\u0000-\u0020\u007f]/.test(value)) return null;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("//") || decoded.includes("\\") || /[\u0000-\u001f\u007f]/.test(decoded)) return null;
  } catch { return null; }
  return value;
}

/** يطابق مساحة العمل بهوية الشركة والدور فقط، دون الثقة ببيانات مخزنة قديمة. */
export function sameWorkspace(ws: WorkspaceDto, other: unknown): boolean {
  if (!other || typeof other !== "object" || !("kind" in other)) return false;
  if (ws.kind === "platform") return other.kind === "platform";
  return (
    other.kind === "company" &&
    "companyId" in other &&
    "role" in other &&
    ws.companyId === other.companyId &&
    ws.role === other.role
  );
}
