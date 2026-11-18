import { createServerFn } from "@tanstack/react-start";
import {
  serviceScope,
  recordSessionInput,
  serviceSessionRecordingAvailable,
  type SessionFormDto,
} from "../contracts";
export const getSessionFormFn = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => serviceScope.parse(v))
  .handler(async ({ data }): Promise<SessionFormDto> => {
    if (!serviceSessionRecordingAvailable) return { canRecord: false, services: [], staff: [] };
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { readSessionForm } = await import("../persistence/session.server");
    return withUser(await requireUserId(), (db) => readSessionForm(db, data.companyId));
  });
export const recordSessionFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => recordSessionInput.parse(v))
  .handler(async ({ data }) => {
    if (!serviceSessionRecordingAvailable) throw new Error("SESSION_RECORDING_UNAVAILABLE");
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { pgSessionRepository } = await import("../persistence/session.server");
    const { recordSession } = await import("../use-cases/record-session");
    const userId = await requireUserId();
    return withUser(userId, (db) =>
      recordSession(pgSessionRepository(db, userId, data.companyId), data, new Date()),
    );
  });
