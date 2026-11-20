import type pg from "pg";
import type { ServiceOverrideRow } from "../domain/plan";
import type {
  SaveServiceOverrideInput,
  ServiceOverrideRepository,
  StoredServiceOverride,
} from "../ports/override-repository";

/** هل المستخدم الحالي مدير تجاوزات (مالك أو مدير فرع بالصلاحية الممنوحة)؟ */
export async function assertOverrideManager(db: pg.PoolClient, companyId: string): Promise<void> {
  const { rows } = await db.query<{ ok: boolean }>(
    "select public.commission_override_manager($1) as ok",
    [companyId],
  );
  if (!rows[0]?.ok) throw new Error("FORBIDDEN");
}

/** هل يدير المستخدم تجاوزات موظفة محددة داخل فرعها؟ */
export async function assertStaffOverrideManager(
  db: pg.PoolClient,
  companyId: string,
  staffId: string,
): Promise<void> {
  const { rows } = await db.query<{ ok: boolean }>(
    "select public.commission_staff_override_manager($1,$2) as ok",
    [companyId, staffId],
  );
  if (!rows[0]?.ok) throw new Error("FORBIDDEN");
}

/**
 * ينفذ منفذ تجاوزات الخدمات؛ الحفظ إضافة فقط وeffective_from تضبطه
 * قاعدة البيانات لحظة الحفظ، والقراءة موزعة بسياسات RLS (021 O4، O5).
 */
export function pgServiceOverrideRepository(
  db: pg.PoolClient,
  userId: string,
  companyId: string,
): ServiceOverrideRepository {
  const audit = async (entityId: string, details: Record<string, unknown>) => {
    await db.query(
      `insert into public.audit_log(company_id,actor_user_id,action,entity,entity_id,details)
       values($1,$2,'commission_override.saved','service_commission_override',$3,$4)`,
      [companyId, userId, entityId, JSON.stringify(details)],
    );
  };
  return {
    async saveOverride(input: SaveServiceOverrideInput) {
      const kind = input.override.kind;
      const rateBp = kind === "rate_bp" ? input.override.rateBp.toString() : null;
      const fixedMills = kind === "fixed_mills" ? input.override.mills.toString() : null;
      const { rows } = await db.query<{ id: string }>(
        `insert into public.service_commission_overrides(
           company_id,service_id,staff_id,override_kind,rate_bp,fixed_mills,created_by
         ) values($1,$2,$3,$4,$5,$6,$7) returning id`,
        [companyId, input.serviceId, input.staffId, kind, rateBp, fixedMills, userId],
      );
      const id = rows[0]!.id;
      await audit(id, { serviceId: input.serviceId, staffId: input.staffId, override: kind });
      return { id };
    },
    async listOverrides() {
      const { rows } = await db.query<{
        id: string;
        serviceId: string;
        serviceName: string;
        staffId: string | null;
        staffName: string | null;
        effectiveFrom: Date;
        overrideKind: "rate_bp" | "fixed_mills" | "clear";
        rateBp: string | null;
        fixedMills: string | null;
      }>(
        `select o.id,o.service_id as "serviceId",c.name as "serviceName",
                o.staff_id as "staffId",s.display_name as "staffName",
                o.effective_from as "effectiveFrom",o.override_kind as "overrideKind",
                o.rate_bp::text as "rateBp",o.fixed_mills::text as "fixedMills"
         from public.service_commission_overrides o
         join public.service_catalog c on c.company_id=o.company_id and c.id=o.service_id
         left join public.staff_members s on s.company_id=o.company_id and s.id=o.staff_id
         where o.company_id=$1
         order by o.effective_from desc,o.id desc`,
        [companyId],
      );
      return rows.map((row) => ({
        id: row.id,
        serviceId: row.serviceId,
        serviceName: row.serviceName,
        staffId: row.staffId,
        staffName: row.staffName,
        effectiveFrom: row.effectiveFrom,
        override:
          row.overrideKind === "rate_bp"
            ? { kind: "rate_bp" as const, rateBp: BigInt(row.rateBp!) }
            : row.overrideKind === "fixed_mills"
              ? { kind: "fixed_mills" as const, mills: BigInt(row.fixedMills!) }
              : { kind: "clear" as const },
      })) satisfies StoredServiceOverride[];
    },
    async overrideHistory(historyCompanyId, staffId, exclusiveEnd) {
      const { rows } = await db.query<{
        id: string;
        staffId: string | null;
        serviceId: string;
        effectiveFrom: Date;
        overrideKind: "rate_bp" | "fixed_mills" | "clear";
        rateBp: string | null;
        fixedMills: string | null;
      }>(
        `select o.id,o.staff_id as "staffId",o.service_id as "serviceId",
                o.effective_from as "effectiveFrom",o.override_kind as "overrideKind",
                o.rate_bp::text as "rateBp",o.fixed_mills::text as "fixedMills"
         from public.service_commission_overrides o
         join public.staff_members s on s.company_id=o.company_id and s.id=$2
         join public.branches b on b.company_id=s.company_id and b.id=s.branch_id
         where o.company_id=$1 and o.effective_from < ($3::timestamp at time zone b.timezone)
           and (o.staff_id = $2 or o.staff_id is null)
         order by o.effective_from,o.id`,
        [historyCompanyId, staffId, exclusiveEnd],
      );
      return rows.map((row) => ({
        id: row.id,
        staffId: row.staffId,
        serviceId: row.serviceId,
        effectiveFrom: row.effectiveFrom,
        override:
          row.overrideKind === "rate_bp"
            ? { kind: "rate_bp" as const, rateBp: BigInt(row.rateBp!) }
            : row.overrideKind === "fixed_mills"
              ? { kind: "fixed_mills" as const, mills: BigInt(row.fixedMills!) }
              : { kind: "clear" as const },
      })) satisfies ServiceOverrideRow[];
    },
  };
}
