import type { WorkspaceDto } from "./session-types";
/** يحدد نطاق لوحة الشركة من الدور النشط، ولا يوسع نطاق مدير الفرع. */
export function overviewBranchScope(workspace: WorkspaceDto): string | null {
  if (
    workspace.kind !== "company" ||
    !["owner", "branch_manager", "accountant", "viewer"].includes(workspace.role)
  )
    throw new Error("FORBIDDEN");
  return workspace.role === "branch_manager" ? workspace.branchId : null;
}
