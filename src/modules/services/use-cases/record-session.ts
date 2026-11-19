import type { SessionFormDto } from "../contracts";
import { serviceSessionRecordingAvailable } from "../domain/session-availability";
import { normalizePhone } from "../domain/client-phone";
import type { SessionFormRecord, SessionRepository } from "../ports/session-repository";
import { checkDiscount } from "../domain/discount";
import { servicePrice } from "./service-price";
import { sessionRequestPayload } from "../domain/session-request";

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
 * يعيد نتيجة الطلب السابق عند تكراره دون أي كتابة جديدة.
 */
export async function recordSession(
  repo: SessionRepository,
  input: RecordSessionInput,
  now: Date,
): Promise<{ id: string; replayed: boolean }> {
  const phone = normalizePhone(input.clientPhone);
  const name = input.clientName.trim();
  if (!name) throw new Error("INVALID_CLIENT");
  const enteredPrice = input.price ? servicePrice(input.price) : undefined;
  const requestPayload = sessionRequestPayload({
    serviceId: input.serviceId,
    staffId: input.staffId,
    clientName: name,
    normalizedPhone: phone,
    occurredAt: input.occurredAt,
    priceMills: enteredPrice,
    reason: input.discountReason,
  });
  const claim = await repo.claimRequest(input.requestId, requestPayload);
  if (claim === "replay") return { id: input.requestId, replayed: true };
  if (claim === "conflict") throw new Error("IDEMPOTENCY_CONFLICT");
  await insertNewSession(repo, input, { name, phone, enteredPrice, requestPayload }, now);
  return { id: input.requestId, replayed: false };
}

/** قيم الطلب بعد التطبيع، محسوبة مرة واحدة قبل حجز مفتاح الطلب. */
interface NormalizedRequest {
  name: string;
  phone: string;
  enteredPrice: bigint | undefined;
  requestPayload: string;
}

/** يتحقق من الإسناد والصلاحية والوقت والخصم ثم يحفظ الجلسة الجديدة وسجل التدقيق. */
async function insertNewSession(
  repo: SessionRepository,
  input: RecordSessionInput,
  { name, phone, enteredPrice, requestPayload }: NormalizedRequest,
  now: Date,
) {
  const id = input.requestId;
  const service = await repo.assignedService(input.serviceId, input.staffId);
  if (!service) throw new Error("NOT_ASSIGNED");
  if (!(await repo.canWrite(service.branchId))) throw new Error("FORBIDDEN");
  const occurredAt = await repo.resolveTime(input.occurredAt, service.timeZone);
  if (occurredAt.getTime() > now.getTime()) throw new Error("FUTURE_SESSION");
  const priceMills = enteredPrice ?? service.priceMills;
  const reason = input.discountReason?.trim() ?? "";
  const bad = checkDiscount(service.priceMills, priceMills, await repo.discountCap(), reason);
  if (bad) throw new Error(bad);
  const discountReason = priceMills === service.priceMills ? null : reason;
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
    discountReason,
    requestPayload,
  });
  await repo.audit(id, {
    serviceId: input.serviceId,
    staffId: input.staffId,
    priceMills: priceMills.toString(),
    listPriceMills: service.priceMills.toString(),
    discountReason,
  });
}

/** يجهز خيارات نموذج الجلسة عند إتاحة التسجيل. */
export async function loadSessionForm(
  read: () => Promise<SessionFormRecord>,
  available = serviceSessionRecordingAvailable,
): Promise<SessionFormDto> {
  if (!available) return { canRecord: false, discountCap: 0, services: [], staff: [] };
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

/** يسمح بتسجيل الجلسة فقط عندما يكون مفتاح الإتاحة مفتوحاً. */
export async function recordAvailableSession<T extends { id: string }>(
  record: () => Promise<T>,
  available = serviceSessionRecordingAvailable,
): Promise<T> {
  if (!available) throw new Error("SESSION_RECORDING_UNAVAILABLE");
  return record();
}
