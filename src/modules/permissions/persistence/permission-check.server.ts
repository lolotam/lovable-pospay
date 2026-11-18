import type pg from "pg";
import type { PermissionKey } from "../contracts";
export async function requirePermission(
  db: pg.PoolClient,
  companyId: string,
  permission: PermissionKey,
): Promise<void> {
  const { rows } = await db.query<{ allowed: boolean }>(
    "select public.has_permission($1,$2) as allowed",
    [companyId, permission],
  );
  if (rows[0]?.allowed !== true) throw new Error("FORBIDDEN");
}
export async function withPermission<T>(
  db: pg.PoolClient,
  companyId: string,
  permission: PermissionKey,
  run: () => Promise<T>,
): Promise<T> {
  await requirePermission(db, companyId, permission);
  return run();
}
