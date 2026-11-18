import { createServerFn } from "@tanstack/react-start";
import { reportInput } from "../report.contracts";
import { readOperationalReport } from "../use-cases/read-operational-report";
export const getOperationalReportFn = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => reportInput.parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { withPermission } = await import("@/modules/permissions/index.server");
    const { readAttendanceReport } = await import("../persistence/report.server");
    const { readServiceReport } = await import("@/modules/services");
    try {
      const userId = await requireUserId();
      if (userId !== data.expectedUserId) return "FORBIDDEN" as const;
      return await withUser(userId, (db) =>
        withPermission(db, data.companyId, "reports.view", () =>
          readOperationalReport(data.tab, {
            attendance: (limit, correctedOnly) =>
              readAttendanceReport(db, data.companyId, data.from, data.until, limit, correctedOnly),
            sessions: (limit) =>
              readServiceReport(db, data.companyId, data.from, data.until, limit),
          }),
        ),
      );
    } catch (error) {
      if (error instanceof Error && ["FORBIDDEN", "UNAUTHENTICATED"].includes(error.message))
        return "FORBIDDEN" as const;
      throw error;
    }
  });
