import type pg from "pg";
import type { OverviewReader } from "../ports/overview-reader";
export interface OverviewQueries {
  attendance(
    companyId: string,
    branchId: string | null,
  ): Promise<{ present: string; exceptions: string }>;
  staff(companyId: string, branchId: string | null): Promise<string>;
  ownAttendance(companyId: string): Promise<string | null>;
  ownPhone(companyId: string): Promise<boolean>;
}
export function pgPlatformOverviewReader(db: pg.PoolClient): Pick<OverviewReader, "platform"> {
  return {
    async platform() {
      const { rows } = await db.query<{ companies: string; users: string }>(
        "select companies::text,users::text from public.platform_overview()",
      );
      if (!rows[0]) throw new Error("FORBIDDEN");
      return rows[0];
    },
  };
}
export function pgOverviewReader(db: pg.PoolClient, queries: OverviewQueries): OverviewReader {
  return {
    ...pgPlatformOverviewReader(db),
    async company(companyId, branchId) {
      return {
        ...(await queries.attendance(companyId, branchId)),
        staff: await queries.staff(companyId, branchId),
      };
    },
    async own(companyId) {
      return {
        attendance: await queries.ownAttendance(companyId),
        bound: await queries.ownPhone(companyId),
      };
    },
  };
}
