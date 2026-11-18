import {
  approveCardPolicy,
  issueCardUseCase,
  loadCardManagement,
  revokeCardUseCase,
} from "../use-cases/card-actions";
import { recordCard, recordCardRequest } from "../use-cases/card-scan";
import { systemClock } from "@/shared/kernel/clock";
import { cryptoIds } from "@/shared/kernel/ids";
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { cardScope, cardStaffInput, revokeCardInput, cardScanInput } from "../card.contracts";
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
type CardScanResponse =
  { status: "recorded"; scan: Awaited<ReturnType<typeof recordCard>> } | { status: "rejected" };

async function executeCardScan(
  execute: () => Promise<Awaited<ReturnType<typeof recordCard>>>,
): Promise<CardScanResponse> {
  try {
    return { status: "recorded", scan: await execute() };
  } catch (error) {
    if (error instanceof Error && ["CARD_REVOKED", "FORBIDDEN"].includes(error.message))
      return { status: "rejected" };
    throw error;
  }
}

export const scanCardFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => cardScanInput.parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { scanCard } = await import("../persistence/card-scan.server");
    const { pgCardScanReceipts } = await import("../persistence/card-scan-receipts.server");
    const { cardHash } = await import("../persistence/card-repository.server");
    try {
      const id = await requireUserId();
      if (id !== data.expectedUserId) return { status: "rejected" as const };
      const fingerprint = await cardHash(
        JSON.stringify([data.token, data.intent, data.promptedRecordId?.toLowerCase() ?? null]),
      );
      return await withUser(id, async (db) => {
        const { rows } = await db.query<{ member: boolean }>(
          "select public.is_member($1) as member",
          [data.companyId],
        );
        if (!rows[0]?.member) return { status: "rejected" as const };
        return recordCardRequest(
          pgCardScanReceipts<CardScanResponse>(db, data.companyId, id, data.requestId),
          fingerprint,
          () =>
            executeCardScan(async () =>
              recordCard(
                { ...data, location: null },
                await scanCard(db, id, data),
                systemClock,
                cryptoIds,
              ),
            ),
        );
      });
    } catch (error) {
      if (
        error instanceof Error &&
        ["UNAUTHENTICATED", "CARD_REQUEST_CONFLICT"].includes(error.message)
      )
        return { status: "rejected" as const };
      throw error;
    }
  });
