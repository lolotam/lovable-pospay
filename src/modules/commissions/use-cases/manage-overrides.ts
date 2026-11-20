import type { ServiceOverridesScreenDto } from "../contracts";
import { parseKwdToMills, parsePercentToBp } from "../domain/parse";
import { CommissionError } from "../domain/plan";
import type { ServiceOverrideRepository } from "../ports/override-repository";

/** أعلى نسبة تجاوز مسموحة: 100% بنقاط الأساس، كقيد الجدول. */
const MAX_RATE_BP = 10000n;

/** مدخل حفظ تجاوز كما يأتي من الشاشة. */
export interface SaveOverrideInput {
  serviceId: string;
  staffId: string | null;
  override:
    | { kind: "rate_bp"; ratePercent: string }
    | { kind: "fixed_mills"; kwd: string }
    | { kind: "clear" };
}

/**
 * يحفظ تجاوز خدمة أو موظفة بعد تحويل النسب والأموال نصياً إلى مجال بلا
 * أرقام عائمة؛ التاريخ السريان تضبطه قاعدة البيانات لحظة الحفظ (021 O5).
 */
export async function saveServiceOverride(
  repository: ServiceOverrideRepository,
  input: SaveOverrideInput,
): Promise<{ id: string }> {
  const override =
    input.override.kind === "rate_bp"
      ? { kind: "rate_bp" as const, rateBp: parsePercentToBp(input.override.ratePercent) }
      : input.override.kind === "fixed_mills"
        ? { kind: "fixed_mills" as const, mills: parseKwdToMills(input.override.kwd) }
        : { kind: "clear" as const };
  if (override.kind === "rate_bp" && override.rateBp > MAX_RATE_BP) {
    throw new CommissionError("OVERRIDE_INVALID");
  }
  return repository.saveOverride({
    serviceId: input.serviceId,
    staffId: input.staffId ?? null,
    override,
  });
}

/** سياق شاشة التجاوزات الذي يجمعه ملف الدوال من مخزن الخدمات والموظفات. */
export interface OverridesScreenContext {
  canManage: boolean;
  services: { id: string; name: string }[];
  staff: { id: string; name: string; branchId: string }[];
}

/** يجهز شاشة التجاوزات: الخدمات والموظفات والسجل الظاهر للمستخدم (021 E). */
export async function loadOverridesScreen(
  repository: ServiceOverrideRepository,
  context: OverridesScreenContext,
): Promise<ServiceOverridesScreenDto> {
  const rows = await repository.listOverrides();
  return {
    canManage: context.canManage,
    services: context.services,
    staff: context.staff,
    overrides: rows.map((row) => ({
      id: row.id,
      serviceId: row.serviceId,
      serviceName: row.serviceName,
      staffId: row.staffId,
      staffName: row.staffName,
      effectiveFrom: row.effectiveFrom.toISOString(),
      override:
        row.override.kind === "rate_bp"
          ? { kind: "rate_bp", rateBp: row.override.rateBp.toString() }
          : row.override.kind === "fixed_mills"
            ? { kind: "fixed_mills", mills: row.override.mills.toString() }
            : { kind: "clear" },
    })),
  };
}
