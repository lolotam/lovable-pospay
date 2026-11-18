import { createServerFn } from "@tanstack/react-start";
import { serviceScope, recordSessionInput } from "../contracts";
export const getSessionFormFn = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => serviceScope.parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { readSessionForm } = await import("../persistence/session.server");
    return withUser(await requireUserId(), (db) => readSessionForm(db, data.companyId));
  });
export const recordSessionFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => recordSessionInput.parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { pgSessionRepository } = await import("../persistence/session.server");
    const { recordSession } = await import("../use-cases/record-session");
    const { servicePrice } = await import("../use-cases/service-price");
    const userId = await requireUserId();
    return withUser(userId, (db) =>
      recordSession(
        pgSessionRepository(db, userId, data.companyId),
        {
          ...data,
          occurredAt: new Date(data.occurredAt),
          priceMills: data.price ? servicePrice(data.price) : undefined,
        },
        new Date(),
        () => crypto.randomUUID(),
      ),
    );
  });
