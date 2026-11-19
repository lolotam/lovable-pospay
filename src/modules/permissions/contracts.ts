import { z } from "zod";

export const companyRoleSchema = z.enum([
  "owner",
  "branch_manager",
  "reception",
  "staff",
  "accountant",
  "viewer",
]);
export type CompanyRole = z.infer<typeof companyRoleSchema>;

export const businessTypeSchema = z.enum(["salon", "restaurant", "laundry", "other"]);
export type BusinessType = z.infer<typeof businessTypeSchema>;

export const permissionKeySchema = z.enum([
  "pos.access",
  "reports.view",
  "attendance.correct",
  "staff.manage",
  "services.manage",
  "discounts.manage",
  "permissions.manage",
]);
export type PermissionKey = z.infer<typeof permissionKeySchema>;

export const areaSchema = z.enum(["admin", "app", "pos", "me"]);
export type Area = z.infer<typeof areaSchema>;

export const workspaceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("platform") }),
  z.object({
    kind: z.literal("company"),
    companyId: z.uuid(),
    companyName: z.string(),
    businessType: businessTypeSchema,
    role: companyRoleSchema,
    branchId: z.uuid().nullable(),
    branchName: z.string().nullable(),
  }),
]);
export type WorkspaceDto = z.infer<typeof workspaceSchema>;

export const sessionContextSchema = z.object({
  user: z.object({ id: z.string(), name: z.string(), email: z.string() }),
  workspaces: z.array(workspaceSchema),
  active: workspaceSchema.nullable(),
  permissions: z.array(permissionKeySchema),
});
export type SessionContextDto = z.infer<typeof sessionContextSchema>;

export const selectWorkspaceInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("platform") }),
  z.object({ kind: z.literal("company"), companyId: z.uuid(), role: companyRoleSchema }),
]);
export type SelectWorkspaceInput = z.infer<typeof selectWorkspaceInputSchema>;

export const editablePermissionSchema = permissionKeySchema.exclude(["permissions.manage"]);
export const overrideStateSchema = z.enum(["default", "allow", "deny"]);
export const memberPermissionsSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  roles: z.array(companyRoleSchema).min(1),
  isOwner: z.boolean(),
  overrides: z.record(editablePermissionSchema, overrideStateSchema),
  otherRestrictions: z.array(z.string()),
  effective: z.array(permissionKeySchema),
});
export type MemberPermissionsDto = z.infer<typeof memberPermissionsSchema>;
export const listMemberPermissionsInput = z.object({ companyId: z.uuid() }).strict();
export const saveOverridesInput = z
  .object({
    companyId: z.uuid(),
    userId: z.string().min(1),
    overrides: z.record(editablePermissionSchema, overrideStateSchema),
  })
  .strict();
export type SaveOverridesInput = z.infer<typeof saveOverridesInput>;
