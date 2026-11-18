import { loadSessionForm, recordAvailableSession } from "../use-cases/record-session";
import { createServerFn } from "@tanstack/react-start";
import { serviceScope, recordSessionInput, type RecordSessionRequest } from "../contracts";
export const getSessionFormFn = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => serviceScope.parse(v))
  .handler(({ data }) =>
    loadSessionForm(async () => {
      const { requireUserId } = await import("@/lib/server/session.server");
      const { withUser } = await import("@/lib/server/db.server");
      const { withPermission } = await import("@/modules/permissions/index.server");
      const { readSessionForm } = await import("../persistence/session.server");
      return withUser(await requireUserId(), (db) =>
        withPermission(db, data.companyId, "pos.access", () => readSessionForm(db, data.companyId)),
      );
    }),
  );
export const recordSessionFn = createServerFn({ method: "POST" })
  .inputValidator((v: RecordSessionRequest) => v)
  .handler(({ data }) =>
    recordAvailableSession(async () => {
      const { requireUserId } = await import("@/lib/server/session.server");
      const { withUser } = await import("@/lib/server/db.server");
      const { withPermission } = await import("@/modules/permissions/index.server");
      const { pgSessionRepository } = await import("../persistence/session.server");
      const { recordSession } = await import("../use-cases/record-session");
      const userId = await requireUserId();
      const request = recordSessionInput.parse(data);
      return withUser(userId, (db) =>
        withPermission(db, request.companyId, "pos.access", () =>
          recordSession(pgSessionRepository(db, userId, request.companyId), request, new Date()),
        ),
      );
    }),
  );
