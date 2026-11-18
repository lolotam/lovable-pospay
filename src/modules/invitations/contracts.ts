import { z } from "zod";
export const invitableRoles = [
  "branch_manager",
  "reception",
  "staff",
  "accountant",
  "viewer",
] as const;
export const inviteScope = z.object({ companyId: z.string().uuid() });
export const createInviteInput = inviteScope.extend({
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(invitableRoles),
  branchId: z.string().uuid().nullable(),
});
export const revokeInviteInput = inviteScope.extend({ id: z.string().uuid() });
export const inviteTokenInput = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });
export const acceptInviteInput = inviteTokenInput.extend({
  name: z.string().trim().min(1).max(120),
  password: z.string().min(8).max(128),
});
export interface InviteDto {
  id: string;
  email: string;
  role: string;
  branch: string | null;
  expiresAt: string;
  status: "pending" | "accepted" | "revoked" | "expired";
}
export interface TeamDto {
  canInvite: boolean;
  isOwner: boolean;
  branches: { id: string; name: string }[];
  invites: InviteDto[];
}
export interface InvitePreviewDto {
  email: string;
  role: string;
  companyName: string;
}
