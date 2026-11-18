import type pg from "pg";
import { cardHash, cardAudit, lockCardStaff } from "./card-repository.server";
import type { CardEligibility } from "../domain/card-policy";
import type { IssuedCard } from "../card.contracts";
export async function issueCard(
  db: pg.PoolClient,
  userId: string,
  companyId: string,
  staffId: string,
  check: (state: CardEligibility) => void,
): Promise<IssuedCard> {
  const staff = await lockCardStaff(db, companyId, staffId);
  const state = await db.query(
    `select exists(select 1 from public.card_policies where company_id=$1) as approved,
 exists(select 1 from public.phone_bindings where company_id=$1 and user_id=$2) as phone,
 exists(select 1 from public.attendance_cards where company_id=$1 and staff_id=$3 and revoked_at is null) as card`,
    [companyId, staff.user_id, staffId],
  );
  check({ ...state.rows[0], manager: staff.manager, denied: false });
  const token = Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("hex");
  const result = await db.query(
    `insert into public.attendance_cards(company_id,staff_id,token_hash,issued_by) values($1,$2,$3,$4) returning id`,
    [companyId, staffId, await cardHash(token), userId],
  );
  await cardAudit(db, userId, companyId, "cards.issued", result.rows[0].id, { staffId });
  return { token, name: staff.name, cardId: result.rows[0].id };
}
export async function revokeCard(
  db: pg.PoolClient,
  userId: string,
  companyId: string,
  cardId: string,
) {
  const result = await db.query(
    `select staff_id from public.attendance_cards where company_id=$1 and id=$2`,
    [companyId, cardId],
  );
  if (!result.rows[0]) throw new Error("FORBIDDEN");
  const staff = await lockCardStaff(db, companyId, result.rows[0].staff_id);
  if (!staff.manager) throw new Error("FORBIDDEN");
  const changed = await db.query(
    `update public.attendance_cards set revoked_at=now(),revoked_by=$3 where company_id=$1 and id=$2 and revoked_at is null returning id`,
    [companyId, cardId, userId],
  );
  if (!changed.rowCount) throw new Error("CARD_REVOKED");
  await cardAudit(db, userId, companyId, "cards.revoked", cardId, {});
}
