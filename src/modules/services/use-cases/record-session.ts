import { serviceSessionRecordingAvailable, type SessionFormDto } from "../contracts";
import { normalizePhone } from "../domain/client-phone";
import type { SessionRepository } from "../ports/session-repository";

/** مدخلات تسجيل جلسة خدمة منفذة. */
export interface RecordSessionInput {
  requestId: string;
  serviceId: string;
  staffId: string;
  clientName: string;
  clientPhone: string;
  occurredAt: string;
}
/**
 * يسجل جلسة خدمة بسعر الكتالوج الحالي للموظفة المسندة.
 * TODO(spec): تعديل السعر والخصم ينتظران اعتماد ق-1.
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
  const clientId = await repo.upsertClient(service.branchId, name, phone);
  await repo.insertSession({
    id,
    serviceId: input.serviceId,
    staffId: input.staffId,
    occurredAt,
    branchId: service.branchId,
    clientId,
    serviceName: service.serviceName,
    priceMills: service.priceMills,
  });
  await repo.audit(id, {
    serviceId: input.serviceId,
    staffId: input.staffId,
    priceMills: service.priceMills.toString(),
  });
  return { id };
}

export function loadSessionForm(read: () => Promise<SessionFormDto>): Promise<SessionFormDto> {
  return serviceSessionRecordingAvailable
    ? read()
    : Promise.resolve({ canRecord: false, services: [], staff: [] });
}
