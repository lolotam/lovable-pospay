import { z } from "zod";
export const serviceScope = z.object({ companyId: z.string().uuid() });
export const saveServiceInput = serviceScope.extend({
  id: z.string().uuid().optional(),
  version: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(120),
  price: z.string().regex(/^\d{1,12}(\.\d{1,3})?$/),
  staffIds: z.array(z.string().uuid()).max(500),
});
export interface ServiceDto {
  id: string;
  name: string;
  priceMills: string;
  version: number;
  staffIds: string[];
}
export interface ServiceCatalogDto {
  canManage: boolean;
  services: ServiceDto[];
  staff: { id: string; name: string }[];
}
export interface SessionReportRow {
  id: string;
  name: string;
  service: string;
  occurredAt: string;
  priceMills: string;
  clientName: string | null;
  clientPhone: string | null;
  late: boolean;
}
export const recordSessionInput = serviceScope.extend({
  serviceId: z.string().uuid(),
  staffId: z.string().uuid(),
  clientName: z.string().trim().min(1).max(120),
  clientPhone: z.string().trim().min(8).max(24),
  occurredAt: z.string().datetime({ offset: true }),
  price: z
    .string()
    .regex(/^\d{1,12}(\.\d{1,3})?$/)
    .optional(),
  discountReason: z.string().trim().max(200).optional(),
});
export interface SessionFormDto {
  canRecord: boolean;
  discountCap: number;
  services: { id: string; name: string; priceMills: string; staffIds: string[] }[];
  staff: { id: string; name: string }[];
}
export const companyRoles = ["reception", "staff", "accountant", "viewer"] as const;
export const discountGrantInput = serviceScope.extend({
  target: z.union([
    z.object({ kind: z.literal("role"), role: z.enum(companyRoles) }),
    z.object({ kind: z.literal("user"), userId: z.string().min(1).max(100) }),
  ]),
  maxPercent: z.number().int().min(1).max(100),
});
export const discountRevokeInput = serviceScope.extend({ id: z.string().uuid() });
export interface DiscountGrantDto {
  id: string;
  role: string | null;
  userId: string | null;
  name: string | null;
  maxPercent: number;
}
export interface DiscountSettingsDto {
  canManage: boolean;
  grants: DiscountGrantDto[];
  members: { userId: string; name: string }[];
}
