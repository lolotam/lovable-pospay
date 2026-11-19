import { createServerFn } from "@tanstack/react-start";
import { companyChartsInput } from "../contracts";
import { loadCompanyCharts, loadMyStrip, loadGrowth } from "../use-cases/load-company-charts";
import { serviceSessionRecordingAvailable } from "@/modules/services";
export const getCompanyChartsFn = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => companyChartsInput.parse(input))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { pgChartReader } = await import("../persistence/charts.server");
    const { pgSessionContextRepository } = await import("../persistence/session-context.server");
    const { readWorkspaceCookie } = await import("../persistence/workspace-cookie.server");
    const { setResponseHeader } = await import("@tanstack/react-start/server");
    const { user } = await requireSession();
    setResponseHeader("Cache-Control", "private, no-store");
    return withUser(user.id, (db) =>
      loadCompanyCharts(
        pgSessionContextRepository(db, user.id),
        pgChartReader(db, user.id),
        user,
        readWorkspaceCookie().remembered,
        data.companyId,
        data.range,
        serviceSessionRecordingAvailable,
      ),
    );
  });
export const getMyAttendanceStripFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireSession } = await import("@/lib/server/session.server");
  const { withUser } = await import("@/lib/server/db.server");
  const { pgChartReader } = await import("../persistence/charts.server");
  const { pgSessionContextRepository } = await import("../persistence/session-context.server");
  const { readWorkspaceCookie } = await import("../persistence/workspace-cookie.server");
  const { setResponseHeader } = await import("@tanstack/react-start/server");
  const { user } = await requireSession();
  setResponseHeader("Cache-Control", "private, no-store");
  return withUser(user.id, (db) =>
    loadMyStrip(
      pgSessionContextRepository(db, user.id),
      pgChartReader(db, user.id),
      user,
      readWorkspaceCookie().remembered,
    ),
  );
});
export const getPlatformGrowthFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireUserId } = await import("@/lib/server/session.server");
  const { withUser } = await import("@/lib/server/db.server");
  const { pgChartReader } = await import("../persistence/charts.server");
  const { pgSessionContextRepository } = await import("../persistence/session-context.server");
  const { setResponseHeader } = await import("@tanstack/react-start/server");
  const id = await requireUserId();
  setResponseHeader("Cache-Control", "private, no-store");
  return withUser(id, (db) =>
    loadGrowth(pgSessionContextRepository(db, id), pgChartReader(db, id)),
  );
});
