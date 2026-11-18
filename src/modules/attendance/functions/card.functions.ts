import {
  approveCardPolicy,
  issueCardUseCase,
  loadCardManagement,
  revokeCardUseCase,
} from "../use-cases/card-actions";
import { readCardStatus, recordCard } from "../use-cases/card-scan";
import { systemClock } from "@/shared/kernel/clock";
import { cryptoIds } from "@/shared/kernel/ids";
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import {
  cardScope,
  cardStaffInput,
  revokeCardInput,
  cardScanInput,
  cardStatusInput,
} from "../card.contracts";
export const getCardsFn = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => cardScope.extend({ expectedUserId: z.string().min(1) }).parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { readCardAccess, readCards } = await import("../persistence/card-repository.server");
    const userId = await requireUserId();
    if (userId !== data.expectedUserId) throw new Error("FORBIDDEN");
    return withUser(userId, (db) =>
      loadCardManagement({
        access: () => readCardAccess(db, data.companyId),
        read: () => readCards(db, data.companyId),
      }),
    );
  });
export const approveCardsFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => cardScope.parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { cardAudit, insertCardPolicy } = await import("../persistence/card-repository.server");
    const id = await requireUserId();
    return withUser(id, (db) =>
      approveCardPolicy({
        insert: () => insertCardPolicy(db, id, data.companyId),
        audit: () => cardAudit(db, id, data.companyId, "cards.policy_approved", data.companyId, {}),
      }),
    );
  });
export const issueCardFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => cardStaffInput.parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { pgCardRepository, cardTokens } = await import("../persistence/card-actions.server");
    const id = await requireUserId();
    return withUser(id, (db) =>
      issueCardUseCase(pgCardRepository(db, id, data.companyId), cardTokens, data.staffId),
    );
  });
export const revokeCardFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => revokeCardInput.parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { pgCardRepository } = await import("../persistence/card-actions.server");
    const id = await requireUserId();
    return withUser(id, (db) =>
      revokeCardUseCase(pgCardRepository(db, id, data.companyId), data.cardId),
    );
  });
export const getCardStatusFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => cardStatusInput.parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { scanCard } = await import("../persistence/card-scan.server");
    try {
      const id = await requireUserId();
      const attendance = await withUser(id, async (db) =>
        readCardStatus(await scanCard(db, id, data)),
      );
      return { status: "confirmed" as const, ...attendance };
    } catch (error) {
      if (
        error instanceof Error &&
        ["CARD_REVOKED", "FORBIDDEN", "UNAUTHENTICATED"].includes(error.message)
      )
        return { status: "unavailable" as const };
      throw error;
    }
  });

export const scanCardFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => cardScanInput.parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { scanCard } = await import("../persistence/card-scan.server");
    const id = await requireUserId();
    try {
      return {
        status: "recorded" as const,
        scan: await withUser(id, async (db) =>
          recordCard(
            { ...data, location: null },
            await scanCard(db, id, data),
            systemClock,
            cryptoIds,
          ),
        ),
      };
    } catch (error) {
      if (error instanceof Error && ["CARD_REVOKED", "FORBIDDEN"].includes(error.message))
        return { status: "rejected" as const };
      throw error;
    }
  });
