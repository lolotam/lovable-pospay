import { createServerFn } from "@tanstack/react-start";
import { reportInput, type OperationalReport } from "../report.contracts";
export const getOperationalReportFn = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => reportInput.parse(v))
  .handler(async ({ data }): Promise<OperationalReport> => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { readAttendanceReport } = await import("../persistence/report.server");
    const { readSessionReport } = await import("@/modules/services/index.server");
    return withUser(await requireUserId(), async (db) => ({
      attendance: await readAttendanceReport(db, data.companyId, data.from, data.until),
      sessions: await readSessionReport(db, data.companyId, data.from, data.until),
    }));
  });
