import { createServerFn } from "@tanstack/react-start";
import { correctionScopeSchema, correctionInputSchema } from "../correction.contracts";

export const getForgottenAttendanceFn = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => correctionScopeSchema.parse(input))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { withPermission } = await import("@/modules/permissions/index.server");
    const { listForgottenAttendance } = await import("../persistence/correction-repository.server");
    const userId = await requireUserId();
    return withUser(userId, (db) =>
      withPermission(db, data.companyId, "attendance.correct", () =>
        listForgottenAttendance(db, userId, data.companyId),
      ),
    );
  });

export const correctAttendanceFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => correctionInputSchema.parse(input))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { withPermission } = await import("@/modules/permissions/index.server");
    const { pgCorrectionRepository } = await import("../persistence/correction-repository.server");
    const { correctAttendance } = await import("../use-cases/correct-attendance");
    const { systemClock } = await import("@/shared/kernel/clock");
    const userId = await requireUserId();
    return withUser(userId, (db) =>
      withPermission(db, data.companyId, "attendance.correct", () =>
        correctAttendance(
          { ...data, correctedAt: new Date(data.correctedAt) },
          { repo: pgCorrectionRepository(db, userId), clock: systemClock },
        ),
      ),
    );
  });
