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
}
