import type { SessionFormDto } from "../contracts";
import { serviceSessionRecordingAvailable } from "../domain/session-availability";
import { normalizePhone } from "../domain/client-phone";
import type { SessionFormRecord, SessionRepository } from "../ports/session-repository";
import { checkDiscount } from "../domain/discount";
import { servicePrice } from "./service-price";

/** مدخلات تسجيل جلسة خدمة منفذة. */
export interface RecordSessionInput {
  requestId: string;
  serviceId: string;
  staffId: string;
  clientName: string;
  clientPhone: string;
  occurredAt: string;
  price?: string | undefined;
  discountReason?: string | undefined;
}
/**
 * يسجل جلسة خدمة للموظفة المسندة؛ السعر هو سعر الكتالوج
 * إلا لو المستخدم عنده صلاحية خصم (ق-1) في حدودها.
 */
export async function recordSession(
  repo: SessionRepository,
  input: RecordSessionInput,
  now: Date,
): Promise<{ id: string }> {
  const phone = normalizePhone(input.clientPhone);
  const name = input.clientName.trim();
  if (!name) throw new Error("INVALID_CLIENT");
  const service = await repo.assignedService(input.serviceId, input.staffId);
  if (!service) throw new Error("NOT_ASSIGNED");
  if (!(await repo.canWrite(service.branchId))) throw new Error("FORBIDDEN");
  const id = input.requestId;
  if (await repo.lockRecordedSession(id)) return { id };
  const occurredAt = await repo.resolveTime(input.occurredAt, service.timeZone);
  if (occurredAt.getTime() > now.getTime()) throw new Error("FUTURE_SESSION");
  const priceMills = input.price ? servicePrice(input.price) : service.priceMills;
  const reason = input.discountReason?.trim() ?? "";
  const bad = checkDiscount(service.priceMills, priceMills, await repo.discountCap(), reason);
  if (bad) throw new Error(bad);
  const clientId = await repo.upsertClient(service.branchId, name, phone);
  await repo.insertSession({
    id,
    serviceId: input.serviceId,
    staffId: input.staffId,
    occurredAt,
    branchId: service.branchId,
    clientId,
    serviceName: service.serviceName,
    priceMills,
    listPriceMills: service.priceMills,
    discountReason: priceMills === service.priceMills ? null : reason,
  });
  await repo.audit(id, {
    serviceId: input.serviceId,
    staffId: input.staffId,
    priceMills: priceMills.toString(),
    listPriceMills: service.priceMills.toString(),
    discountReason: priceMills === service.priceMills ? null : reason,
  });
  return { id };
}

/** يجهز خيارات نموذج الجلسة عند إتاحة التسجيل. */
export async function loadSessionForm(
  read: () => Promise<SessionFormRecord>,
): Promise<SessionFormDto> {
  if (!serviceSessionRecordingAvailable) return { canRecord: false, discountCap: 0, services: [], staff: [] };
  const { canRecord, discountCap, services, staff } = await read();
  return {
    canRecord,
    discountCap,
    services: services.map((service) => ({
      ...service,
      priceMills: service.priceMills.toString(),
    })),
    staff,
  };
}

export async function recordAvailableSession(record: () => Promise<{ id: string }>) {
  if (!serviceSessionRecordingAvailable) throw new Error("SESSION_RECORDING_UNAVAILABLE");
  return record();
}
