import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  loadPlatformOverview,
  loadCompanyOverview,
  loadOwnOverview,
} from "../use-cases/load-overview";
const overviewInput = z.object({ companyId: z.uuid() });
export const getPlatformOverview = createServerFn({ method: "GET" }).handler(async () => {
  const { requireUserId } = await import("@/lib/server/session.server");
  const { withUser } = await import("@/lib/server/db.server");
  const { pgPlatformOverviewReader } = await import("../persistence/overview.server");
  const { setResponseHeader } = await import("@tanstack/react-start/server");
  setResponseHeader("Cache-Control", "private, no-store");
  return withUser(await requireUserId(), (db) =>
    loadPlatformOverview(pgPlatformOverviewReader(db)),
  );
});
export const getCompanyOverview = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => overviewInput.parse(input))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { pgSessionContextRepository } = await import("../persistence/session-context.server");
    const { pgOverviewReader } = await import("../persistence/overview.server");
    const { readWorkspaceCookie } = await import("../persistence/workspace-cookie.server");
    const { readAttendanceOverview, readOwnAttendanceOverview } =
      await import("@/modules/attendance/index.server");
    const { readStaffCount, readOwnPhoneState } = await import("@/modules/staff/index.server");
    const { setResponseHeader } = await import("@tanstack/react-start/server");
    const { user } = await requireSession();
    setResponseHeader("Cache-Control", "private, no-store");
    return withUser(user.id, (db) =>
      loadCompanyOverview(
        pgSessionContextRepository(db, user.id),
        pgOverviewReader(db, {
          attendance: (company, branch) => readAttendanceOverview(db, company, branch),
          staff: (company, branch) => readStaffCount(db, company, branch),
          ownAttendance: (company) => readOwnAttendanceOverview(db, company, user.id),
          ownPhone: (company) => readOwnPhoneState(db, company, user.id),
        }),
        user,
        readWorkspaceCookie().remembered,
        data.companyId,
      ),
    );
  });
export const getMyOverview = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => overviewInput.parse(input))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { pgSessionContextRepository } = await import("../persistence/session-context.server");
    const { pgOverviewReader } = await import("../persistence/overview.server");
    const { readWorkspaceCookie } = await import("../persistence/workspace-cookie.server");
    const { readAttendanceOverview, readOwnAttendanceOverview } =
      await import("@/modules/attendance/index.server");
    const { readStaffCount, readOwnPhoneState } = await import("@/modules/staff/index.server");
    const { setResponseHeader } = await import("@tanstack/react-start/server");
    const { user } = await requireSession();
    setResponseHeader("Cache-Control", "private, no-store");
    return withUser(user.id, (db) =>
      loadOwnOverview(
        pgSessionContextRepository(db, user.id),
        pgOverviewReader(db, {
          attendance: (company, branch) => readAttendanceOverview(db, company, branch),
          staff: (company, branch) => readStaffCount(db, company, branch),
          ownAttendance: (company) => readOwnAttendanceOverview(db, company, user.id),
          ownPhone: (company) => readOwnPhoneState(db, company, user.id),
        }),
        user,
        readWorkspaceCookie().remembered,
        data.companyId,
      ),
    );
  });
