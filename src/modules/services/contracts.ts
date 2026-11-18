import { z } from "zod";
export const serviceScope = z.object({ companyId: z.string().uuid() });
export const saveServiceInput = serviceScope.extend({
  id: z.string().uuid().optional(),
  requestId: z.string().uuid().optional(),
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
  timeZone: string;
  priceMills: string;
  clientName: string | null;
  late: boolean;
}
// D-44: release requires an owner decision on adjusted prices and discounts.
export const serviceSessionRecordingAvailable = false;

export const recordSessionInput = serviceScope.extend({
  requestId: z.string().uuid(),
  serviceId: z.string().uuid(),
  staffId: z.string().uuid(),
  clientName: z.string().trim().min(1).max(120),
  clientPhone: z.string().trim().min(8).max(24),
  occurredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
});
export interface SessionFormDto {
  canRecord: boolean;
  services: { id: string; name: string; priceMills: string; staffIds: string[] }[];
  staff: { id: string; name: string; timeZone: string }[];
}
