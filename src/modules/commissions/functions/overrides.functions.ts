import { createServerFn } from "@tanstack/react-start";
import { companyScope, saveServiceOverrideInput } from "../contracts";
import type pg from "pg";

/** هل المستخدم يدير تجاوزات الخدمة العامة (مالك أو مدير بالصلاحية الممنوحة)؟ */
async function canOverrideManage(db: pg.PoolClient, companyId: string): Promise<boolean> {
  const { rows } = await db.query<{ ok: boolean }>(
    "select public.commission_override_manager($1) as ok",
    [companyId],
  );
  return Boolean(rows[0]?.ok);
}

/** يمنع غير المصرح لهم من قراءة شاشة التجاوزات (021 O4). */
async function assertPlanManager(db: pg.PoolClient, companyId: string): Promise<void> {
  const { rows } = await db.query<{ ok: boolean }>(
    "select public.commission_plan_manager($1) as ok",
    [companyId],
  );
  if (!rows[0]?.ok) throw new Error("FORBIDDEN");
}

/** شاشة التجاوزات: الخدمات والموظفات المسموح بها والسجل الظاهر (021 E). */
export const getServiceOverridesFn = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => companyScope.parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { pgServiceOverrideRepository } = await import("../persistence/service-override.server");
    const { loadOverridesScreen } = await import("../use-cases/manage-overrides");
    const userId = await requireUserId();
    return withUser(userId, async (db) => {
      await assertPlanManager(db, data.companyId);
      const canManage = await canOverrideManage(db, data.companyId);
      const services = await db.query<{ id: string; name: string }>(
        "select id,name from public.service_catalog where company_id=$1 order by name,id",
        [data.companyId],
      );
      const staff = await db.query<{ id: string; name: string; branchId: string }>(
        `select s.id,s.display_name as name,s.branch_id as "branchId"
         from public.staff_members s
         where s.company_id=$1 and public.commission_plan_assigner($1,s.id)
         order by s.display_name,s.id`,
        [data.companyId],
      );
      return loadOverridesScreen(pgServiceOverrideRepository(db, userId, data.companyId), {
        canManage,
        services: services.rows,
        staff: staff.rows,
      });
    });
  });

/** يحفظ تجاوز خدمة أو موظفة؛ التواريخ الماضية ترفضها RLS (021 O5). */
export const saveServiceOverrideFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => saveServiceOverrideInput.parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { pgServiceOverrideRepository, assertOverrideManager, assertStaffOverrideManager } =
      await import("../persistence/service-override.server");
    const { saveServiceOverride } = await import("../use-cases/manage-overrides");
    const userId = await requireUserId();
    return withUser(userId, async (db) => {
      if (data.staffId) await assertStaffOverrideManager(db, data.companyId, data.staffId);
      else await assertOverrideManager(db, data.companyId);
      return saveServiceOverride(pgServiceOverrideRepository(db, userId, data.companyId), {
        ...data,
        staffId: data.staffId ?? null,
      });
    });
  });
