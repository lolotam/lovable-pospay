import { normalizePhone } from "../domain/client-phone";
import { checkDiscount } from "../domain/discount";
import type { SessionRepository } from "../ports/session-repository";

/** مدخلات تسجيل جلسة خدمة منفذة. */
export interface RecordSessionInput {
  serviceId: string;
  staffId: string;
  clientName: string;
  clientPhone: string;
  occurredAt: Date;
  priceMills?: bigint | undefined;
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
  newId: () => string,
): Promise<{ id: string }> {
  if (input.occurredAt.getTime() > now.getTime() + 5 * 60_000) throw new Error("FUTURE_SESSION");
  const phone = normalizePhone(input.clientPhone);
  const name = input.clientName.trim();
  if (!name) throw new Error("INVALID_CLIENT");
  const service = await repo.assignedService(input.serviceId, input.staffId);
  if (!service) throw new Error("NOT_ASSIGNED");
  if (!(await repo.canWrite(service.branchId))) throw new Error("FORBIDDEN");
  const priceMills = input.priceMills ?? service.priceMills;
  const reason = input.discountReason?.trim() ?? "";
  const bad = checkDiscount(service.priceMills, priceMills, await repo.discountCap(), reason);
  if (bad) throw new Error(bad);
  const clientId = await repo.upsertClient(name, phone);
  const id = newId();
  await repo.insertSession({
    id,
    ...input,
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
