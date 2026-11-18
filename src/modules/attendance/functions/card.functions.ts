import {
  approveCardPolicy,
  issueCardUseCase,
  loadCardManagement,
  revokeCardUseCase,
} from "../use-cases/card-actions";
import { recordCard } from "../use-cases/card-scan";
import { systemClock } from "@/shared/kernel/clock";
import { cryptoIds } from "@/shared/kernel/ids";
import { createServerFn } from "@tanstack/react-start";
import { cardScope, cardStaffInput, revokeCardInput, cardScanInput } from "../card.contracts";
export const getCardsFn = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => cardScope.parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { readCardAccess, readCards } = await import("../persistence/card-repository.server");
    return withUser(await requireUserId(), (db) =>
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
export const scanCardFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => cardScanInput.parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { scanCard } = await import("../persistence/card-scan.server");
    const id = await requireUserId();
    return withUser(id, async (db) =>
      recordCard({ ...data, location: null }, await scanCard(db, id, data), systemClock, cryptoIds),
    );
  });
