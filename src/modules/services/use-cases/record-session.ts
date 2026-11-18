import { normalizePhone } from "../domain/client-phone";
import type { SessionRepository } from "../ports/session-repository";

/** مدخلات تسجيل جلسة خدمة منفذة. */
export interface RecordSessionInput {
  serviceId: string;
  staffId: string;
  clientName: string;
  clientPhone: string;
  occurredAt: Date;
}
/**
 * يسجل جلسة خدمة بسعر الكتالوج الحالي للموظفة المسندة.
 * TODO(spec): تعديل السعر والخصم ينتظران اعتماد ق-1.
 */
export async function recordSession(
  repo: SessionRepository,
  input: RecordSessionInput,
  now: Date,
  newId: () => string,
): Promise<{ id: string }> {
  if (input.occurredAt.getTime() > now.getTime() + 5 * 60_000) throw new Error("FUTURE_SESSION");
  const phone = normalizePhone(input.clientPhone);
  const name = input.clientName.trim();
  if (!name) throw new Error("INVALID_CLIENT");
  const service = await repo.assignedService(input.serviceId, input.staffId);
  if (!service) throw new Error("NOT_ASSIGNED");
  if (!(await repo.canWrite(service.branchId))) throw new Error("FORBIDDEN");
  const clientId = await repo.upsertClient(name, phone);
  const id = newId();
  await repo.insertSession({
    id,
    ...input,
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
