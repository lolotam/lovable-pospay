import { createServerFn } from "@tanstack/react-start";
import { companyScope, recordSalaryInput, staffSalariesScreenInput } from "../contracts";
import type pg from "pg";

/** يمنع من ليس مالكاً ولا مدير فرع من شاشة الرواتب قبل القراءة (021 Q2). */
async function assertSalaryScreenAccess(db: pg.PoolClient, companyId: string): Promise<void> {
  const { rows } = await db.query<{ ok: boolean }>(
    `select (public.has_company_role($1,'owner') or public.has_company_role($1,'branch_manager')) as ok`,
    [companyId],
  );
  if (!rows[0]?.ok) throw new Error("FORBIDDEN");
}

/** شاشة الرواتب: موظفات فروع المستخدم فقط مع السجل الكامل (021 Q2، S3). */
export const getStaffSalariesFn = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => staffSalariesScreenInput.parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { pgSalaryRepository, listSalaryStaff } = await import("../persistence/salary.server");
    const { loadSalariesScreen } = await import("../use-cases/manage-salaries");
    return withUser(await requireUserId(), async (db) => {
      await assertSalaryScreenAccess(db, data.companyId);
      const staff = await listSalaryStaff(db, data.companyId);
      return loadSalariesScreen(
        pgSalaryRepository(db, await requireUserId(), data.companyId),
        staff,
      );
    });
  });

/** يسجل راتباً فعالاً بالتاريخ؛ RLS يحصر الكتابة بفرع المدير (021 S3). */
export const recordSalaryFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => recordSalaryInput.parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { pgSalaryRepository, assertSalaryManager } =
      await import("../persistence/salary.server");
    const { recordSalary } = await import("../use-cases/manage-salaries");
    const userId = await requireUserId();
    return withUser(userId, async (db) => {
      await assertSalaryManager(db, data.companyId, data.staffId);
      return recordSalary(pgSalaryRepository(db, userId, data.companyId), data);
    });
  });
