import { createServerFn } from "@tanstack/react-start";
import { reportInput } from "../report.contracts";
import { readOperationalReport } from "../use-cases/read-operational-report";
export const getOperationalReportFn = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => reportInput.parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { readAttendanceReport } = await import("../persistence/report.server");
    const { readSessionReport } = await import("@/modules/services/index.server");
    return withUser(await requireUserId(), (db) =>
      readOperationalReport({
        attendance: (limit) =>
          readAttendanceReport(db, data.companyId, data.from, data.until, limit),
        sessions: (limit) => readSessionReport(db, data.companyId, data.from, data.until, limit),
      }),
    );
  });
