import type pg from "pg";
import { cardHash, cardAudit, lockCardStaff } from "./card-repository.server";
import type { CardRepository } from "../ports/card-repository";

export function pgCardRepository(
  db: pg.PoolClient,
  userId: string,
  companyId: string,
): CardRepository {
  return {
    async lockStaff(staffId) {
      const row = await lockCardStaff(db, companyId, staffId);
      return { id: row.id, name: row.name, userId: row.user_id, manager: row.manager };
    },
    async eligibility(staff) {
      const state = await db.query(
        `select exists(select 1 from public.card_policies where company_id=$1) as approved,
 exists(select 1 from public.phone_bindings where company_id=$1 and user_id=$2) as phone,
 exists(select 1 from public.attendance_cards where company_id=$1 and staff_id=$3 and revoked_at is null) as card`,
        [companyId, staff.userId, staff.id],
      );
      return state.rows[0];
    },
    async insertCard(staffId, tokenHash) {
      const result = await db.query(
        `insert into public.attendance_cards(company_id,staff_id,token_hash,issued_by) values($1,$2,$3,$4) returning id`,
        [companyId, staffId, tokenHash, userId],
      );
      return result.rows[0].id;
    },
    async cardStaff(cardId) {
      const result = await db.query(
        `select staff_id from public.attendance_cards where company_id=$1 and id=$2`,
        [companyId, cardId],
      );
      return result.rows[0]?.staff_id ?? null;
    },
    async markRevoked(cardId) {
      const changed = await db.query(
        `update public.attendance_cards set revoked_at=now(),revoked_by=$3 where company_id=$1 and id=$2 and revoked_at is null returning id`,
        [companyId, cardId, userId],
      );
      return Boolean(changed.rowCount);
    },
    audit: (action, id, details) => cardAudit(db, userId, companyId, action, id, details),
  };
}

export const cardTokens = {
  generate: () => Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("hex"),
  hash: cardHash,
};
