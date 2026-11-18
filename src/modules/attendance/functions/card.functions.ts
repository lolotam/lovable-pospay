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

const cardAccountScope = cardScope.extend({ expectedUserId: z.string().min(1) });
const issueCardRequest = cardStaffInput.extend({ expectedUserId: z.string().min(1) });
const revokeCardRequest = revokeCardInput.extend({ expectedUserId: z.string().min(1) });

export const getCardsFn = createServerFn({ method: "GET" })
  .inputValidator((v: z.input<typeof cardAccountScope>) => v)
  .handler(async ({ data: input }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { withPermission } = await import("@/modules/permissions/index.server");
    const { readCardAccess, readCards } = await import("../persistence/card-repository.server");
    const userId = await requireUserId();
    const data = cardAccountScope.parse(input);
    if (userId !== data.expectedUserId) throw new Error("FORBIDDEN");
    return withUser(userId, (db) =>
      withPermission(db, data.companyId, "staff.manage", () =>
        loadCardManagement({
          access: () => readCardAccess(db, data.companyId),
          read: () => readCards(db, data.companyId),
        }),
      ),
    );
  });
export const approveCardsFn = createServerFn({ method: "POST" })
  .inputValidator((v: z.input<typeof cardAccountScope>) => v)
  .handler(async ({ data: input }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { withPermission } = await import("@/modules/permissions/index.server");
    const { cardAudit, insertCardPolicy } = await import("../persistence/card-repository.server");
    const id = await requireUserId();
    const data = cardAccountScope.parse(input);
    if (id !== data.expectedUserId) throw new Error("FORBIDDEN");
    return withUser(id, (db) =>
      withPermission(db, data.companyId, "staff.manage", () =>
        approveCardPolicy({
          insert: () => insertCardPolicy(db, id, data.companyId),
          audit: () =>
            cardAudit(db, id, data.companyId, "cards.policy_approved", data.companyId, {}),
        }),
      ),
    );
  });
export const issueCardFn = createServerFn({ method: "POST" })
  .inputValidator((v: z.input<typeof issueCardRequest>) => v)
  .handler(async ({ data: input }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { withPermission } = await import("@/modules/permissions/index.server");
    const { pgCardRepository, cardTokens } = await import("../persistence/card-actions.server");
    const id = await requireUserId();
    const data = issueCardRequest.parse(input);
    if (id !== data.expectedUserId) throw new Error("FORBIDDEN");
    return withUser(id, (db) =>
      withPermission(db, data.companyId, "staff.manage", () =>
        issueCardUseCase(pgCardRepository(db, id, data.companyId), cardTokens, data.staffId),
      ),
    );
  });
export const revokeCardFn = createServerFn({ method: "POST" })
  .inputValidator((v: z.input<typeof revokeCardRequest>) => v)
  .handler(async ({ data: input }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { withPermission } = await import("@/modules/permissions/index.server");
    const { pgCardRepository } = await import("../persistence/card-actions.server");
    const id = await requireUserId();
    const data = revokeCardRequest.parse(input);
    if (id !== data.expectedUserId) throw new Error("FORBIDDEN");
    return withUser(id, (db) =>
      withPermission(db, data.companyId, "staff.manage", () =>
        revokeCardUseCase(pgCardRepository(db, id, data.companyId), data.cardId),
      ),
    );
  });
type CardScanResponse =
  | { status: "recorded"; scan: Awaited<ReturnType<typeof recordCard>> }
  | { status: "rejected" }
  | { status: "clock_invalid" }
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
  .inputValidator((v: z.input<typeof cardScanInput>) => v)
  .handler(({ data: input }) =>
    withCardRequest(input, cardScanInput, async (data, { db, userId, receipts }) => {
      const { scanCard } = await import("../persistence/card-scan.server");
      const { cardHash } = await import("../persistence/card-repository.server");
      const promptedRecordId = data.promptedRecordId?.toLowerCase();
      const fingerprint = await cardHash(
        JSON.stringify([data.token, data.intent, promptedRecordId ?? null]),
      );
      return recordCardRequest(receipts, fingerprint, async () => {
        const window = cardRequestWindow(data.requestedAt, Date.now());
        if (window === "too_early") return { status: "clock_invalid" };
        if (window === "expired") return { status: "rejected" };
        return executeCardScan(async () =>
          recordCard(
            { ...data, ...(promptedRecordId ? { promptedRecordId } : {}), location: null },
            await scanCard(db, userId, data),
            systemClock,
            cryptoIds,
          ),
        );
      });
    }),
  );

export const settleCardScanFn = createServerFn({ method: "POST" })
  .inputValidator((v: z.input<typeof cardRequestInput>) => v)
  .handler(({ data: input }) =>
    withCardRequest(input, cardRequestInput, (data, { receipts }) =>
      settleCardRequest(receipts, () => {
        const window = cardRequestWindow(data.requestedAt, Date.now());
        if (window === "too_early") return { status: "clock_invalid" };
        return { status: window === "expired" ? "rejected" : "cancelled" };
      }),
    ),
  );

type CardRequestContext = {
  db: pg.PoolClient;
  userId: string;
  receipts: CardScanReceipts<CardScanResponse>;
};

async function withCardRequest<Request extends CardRequest>(
  input: unknown,
  schema: { parse(input: unknown): Request },
  run: (data: Request, context: CardRequestContext) => Promise<CardScanResponse>,
): Promise<CardScanResponse> {
  const { requireUserId } = await import("@/lib/server/session.server");
  const { withUser } = await import("@/lib/server/db.server");
  const { withPermission } = await import("@/modules/permissions/index.server");
  const { pgCardScanReceipts } = await import("../persistence/card-scan-receipts.server");
  try {
    const userId = await requireUserId();
    const data = schema.parse(input);
    if (userId !== data.expectedUserId) return { status: "unverified" };
    return await withUser(userId, async (db) => {
      await withPermission(db, data.companyId, "pos.access", async () => undefined);
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
      return run(data, { db, userId, receipts });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED")
      return { status: "unverified" };
    if (error instanceof Error && ["CARD_REQUEST_CONFLICT", "FORBIDDEN"].includes(error.message))
      return { status: "rejected" };
    throw error;
  }
}
