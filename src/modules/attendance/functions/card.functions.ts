import {
  approveCardPolicy,
  issueCardUseCase,
  loadCardManagement,
  revokeCardUseCase,
} from "../use-cases/card-actions";
import {
  cardRequestWindow,
  recordCard,
  recordCardRequest,
  settleCardRequest,
} from "../use-cases/card-scan";
import { systemClock } from "@/shared/kernel/clock";
import { cryptoIds } from "@/shared/kernel/ids";
import type pg from "pg";
import type { CardScanReceipts } from "../ports/card-scan-receipts";
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import {
  cardScope,
  cardStaffInput,
  revokeCardInput,
  cardScanInput,
  cardRequestInput,
  type CardRequest,
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
  .inputValidator((v: unknown) => cardScope.extend({ expectedUserId: z.string().min(1) }).parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { cardAudit, insertCardPolicy } = await import("../persistence/card-repository.server");
    const id = await requireUserId();
    if (id !== data.expectedUserId) throw new Error("FORBIDDEN");
    return withUser(id, (db) =>
      approveCardPolicy({
        insert: () => insertCardPolicy(db, id, data.companyId),
        audit: () => cardAudit(db, id, data.companyId, "cards.policy_approved", data.companyId, {}),
      }),
    );
  });
export const issueCardFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) =>
    cardStaffInput.extend({ expectedUserId: z.string().min(1) }).parse(v),
  )
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { pgCardRepository, cardTokens } = await import("../persistence/card-actions.server");
    const id = await requireUserId();
    if (id !== data.expectedUserId) throw new Error("FORBIDDEN");
    return withUser(id, (db) =>
      issueCardUseCase(pgCardRepository(db, id, data.companyId), cardTokens, data.staffId),
    );
  });
export const revokeCardFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) =>
    revokeCardInput.extend({ expectedUserId: z.string().min(1) }).parse(v),
  )
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { pgCardRepository } = await import("../persistence/card-actions.server");
    const id = await requireUserId();
    if (id !== data.expectedUserId) throw new Error("FORBIDDEN");
    return withUser(id, (db) =>
      revokeCardUseCase(pgCardRepository(db, id, data.companyId), data.cardId),
    );
  });
type CardScanResponse =
  | { status: "recorded"; scan: Awaited<ReturnType<typeof recordCard>> }
  | { status: "rejected" }
  | { status: "cancelled" }
  | { status: "unverified" };

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
  .handler(({ data }) =>
    withCardRequest(data, "scan", async ({ db, userId, receipts }) => {
      const { scanCard } = await import("../persistence/card-scan.server");
      const { cardHash } = await import("../persistence/card-repository.server");
      const promptedRecordId = data.promptedRecordId?.toLowerCase();
      const fingerprint = await cardHash(
        JSON.stringify([data.token, data.intent, promptedRecordId ?? null]),
      );
      return recordCardRequest(receipts, fingerprint, () =>
        executeCardScan(async () =>
          recordCard(
            { ...data, ...(promptedRecordId ? { promptedRecordId } : {}), location: null },
            await scanCard(db, userId, data),
            systemClock,
            cryptoIds,
          ),
        ),
      );
    }),
  );

export const settleCardScanFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => cardRequestInput.parse(v))
  .handler(({ data }) =>
    withCardRequest(data, "settle", ({ receipts, expired }) =>
      settleCardRequest(receipts, { status: expired ? "rejected" : "cancelled" }),
    ),
  );

type CardRequestContext = {
  db: pg.PoolClient;
  userId: string;
  receipts: CardScanReceipts<CardScanResponse>;
  expired: boolean;
};

async function withCardRequest(
  data: CardRequest,
  operation: "scan" | "settle",
  run: (context: CardRequestContext) => Promise<CardScanResponse>,
): Promise<CardScanResponse> {
  const { requireUserId } = await import("@/lib/server/session.server");
  const { withUser } = await import("@/lib/server/db.server");
  const { pgCardScanReceipts } = await import("../persistence/card-scan-receipts.server");
  try {
    const userId = await requireUserId();
    const window = cardRequestWindow(data.requestedAt, Date.now());
    if (userId !== data.expectedUserId || window === "too_early") return { status: "unverified" };
    if (operation === "scan" && window === "expired") return { status: "rejected" };
    return await withUser(userId, async (db) => {
      const { rows } = await db.query<{ member: boolean }>(
        "select public.is_member($1) as member",
        [data.companyId],
      );
      if (!rows[0]?.member) return { status: "unverified" };
      const receipts = pgCardScanReceipts<CardScanResponse>(
        db,
        data.companyId,
        userId,
        data.requestId,
      );
      return run({ db, userId, receipts, expired: window === "expired" });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED")
      return { status: "unverified" };
    if (error instanceof Error && error.message === "CARD_REQUEST_CONFLICT")
      return { status: "rejected" };
    throw error;
  }
}
