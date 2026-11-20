import type pg from "pg";
import type { FailedPinAttemptRecord, ManagerPinRepository } from "../ports/manager-pin-repository";
import { memberNames } from "./member-names.server";

/**
 * ينفذ منفذ رمز PIN على PostgreSQL؛ التخزين والتحقق يتمان داخل دوال
 * security definer ولا يقر التطبيق بالرمز أو بصمته أبداً (020 B2).
 */
export function pgManagerPinRepository(db: pg.PoolClient, companyId: string): ManagerPinRepository {
  return {
    async setPin(pin) {
      await db.query("select public.set_manager_pin($1,$2)", [companyId, pin]);
    },
    async hasPin() {
      const { rows } = await db.query<{ has: boolean }>(
        "select public.has_manager_pin($1) as has",
        [companyId],
      );
      return Boolean(rows[0]?.has);
    },
    listFailedAttempts: (limit) => listFailedAttempts(db, companyId, limit),
  };
}

/** يقرأ محاولات PIN الفاشلة في فروع المستخدم المصرح لها (مالك أو معتمد فرع). */
async function listFailedAttempts(
  db: pg.PoolClient,
  companyId: string,
  limit: number,
): Promise<FailedPinAttemptRecord[]> {
  const { rows } = await db.query<{
    id: string;
    branch_id: string;
    session_id: string;
    approver_user_id: string;
    requested_by: string;
    user_agent: string | null;
    attempted_at: Date;
  }>(
    `select a.id,a.branch_id,a.session_id,a.approver_user_id,a.requested_by,
            a.user_agent,a.attempted_at
     from public.manager_pin_attempts a
     where a.company_id=$1
     order by a.attempted_at desc limit $2`,
    [companyId, limit],
  );
  const names = await memberNames(db, companyId);
  return rows.map((row) => ({
    id: row.id,
    branchId: row.branch_id,
    sessionId: row.session_id,
    approverUserId: row.approver_user_id,
    approverName: names.get(row.approver_user_id) ?? null,
    requestedBy: row.requested_by,
    requesterName: names.get(row.requested_by) ?? null,
    userAgent: row.user_agent,
    attemptedAt: row.attempted_at,
  }));
}
