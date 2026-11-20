import { createServerFn } from "@tanstack/react-start";
import {
  companyScope,
  commissionPlansScreenInput,
  createPlanWithVersionInput,
  addPlanVersionInput,
  assignPlanInput,
} from "../contracts";
import type pg from "pg";

/** يمنع غير المديرين (مالك أو مدير فرع) من شاشة الخطط قبل أي قراءة (021 M8). */
async function assertPlanManager(db: pg.PoolClient, companyId: string): Promise<void> {
  const { rows } = await db.query<{ ok: boolean }>(
    "select public.commission_plan_manager($1) as ok",
    [companyId],
  );
  if (!rows[0]?.ok) throw new Error("FORBIDDEN");
}

/** يمنع من لا يسيند خططاً لموظفة محددة قبل الكتابة (021 M8). */
async function assertPlanAssigner(
  db: pg.PoolClient,
  companyId: string,
  staffId: string,
): Promise<void> {
  const { rows } = await db.query<{ ok: boolean }>(
    "select public.commission_plan_assigner($1,$2) as ok",
    [companyId, staffId],
  );
  if (!rows[0]?.ok) throw new Error("FORBIDDEN");
}

/** شاشة الخطط والإسنادات لشهر محدد أو الشهر الحالي على الخادم. */
export const getCommissionPlansFn = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => commissionPlansScreenInput.parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { pgCommissionPlanRepository } = await import("../persistence/commission-plan.server");
    const { loadPlansScreen } = await import("../use-cases/manage-plans");
    const now = new Date();
    const period = data.periodMonth
      ? { year: Number(data.periodMonth.slice(0, 4)), month: Number(data.periodMonth.slice(5, 7)) }
      : { year: now.getFullYear(), month: now.getMonth() + 1 };
    return withUser(await requireUserId(), async (db) => {
      await assertPlanManager(db, data.companyId);
      const repository = pgCommissionPlanRepository(db, await requireUserId(), data.companyId);
      return loadPlansScreen(repository, period);
    });
  });

/** ينشئ خطة بإصدارها الأول؛ RLS يمنع غير المديرين أيضاً (021 M8). */
export const createPlanWithVersionFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => createPlanWithVersionInput.parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { pgCommissionPlanRepository } = await import("../persistence/commission-plan.server");
    const { createPlanWithVersion } = await import("../use-cases/manage-plans");
    const userId = await requireUserId();
    return withUser(userId, async (db) => {
      await assertPlanManager(db, data.companyId);
      return createPlanWithVersion(pgCommissionPlanRepository(db, userId, data.companyId), data);
    });
  });

/** يضيف إصداراً مصححاً لإصدارات الخطة (021 M7). */
export const addPlanVersionFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => addPlanVersionInput.parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { pgCommissionPlanRepository } = await import("../persistence/commission-plan.server");
    const { addPlanVersion } = await import("../use-cases/manage-plans");
    const userId = await requireUserId();
    return withUser(userId, async (db) => {
      await assertPlanManager(db, data.companyId);
      return addPlanVersion(pgCommissionPlanRepository(db, userId, data.companyId), data);
    });
  });

/** يسند خطة لموظفة من أول الشهر؛ مدير الفرع لموظفات فرعه فقط (021 M8). */
export const assignPlanFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => assignPlanInput.parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { pgCommissionPlanRepository } = await import("../persistence/commission-plan.server");
    const { assignPlan } = await import("../use-cases/manage-plans");
    const userId = await requireUserId();
    return withUser(userId, async (db) => {
      await assertPlanAssigner(db, data.companyId, data.staffId);
      return assignPlan(pgCommissionPlanRepository(db, userId, data.companyId), data);
    });
  });
