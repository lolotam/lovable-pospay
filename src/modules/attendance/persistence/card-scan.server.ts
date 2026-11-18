import type pg from "pg";
import type { z } from "zod";
import type { cardScanInput } from "../card.contracts";
import { cardHash } from "./card-repository.server";
import { pgAttendanceRepository } from "./attendance-repository.server";

export async function scanCard(
  db: pg.PoolClient,
  userId: string,
  input: z.infer<typeof cardScanInput>,
) {
  const hash = await cardHash(input.token);
  const card = await db.query<{ staff_id: string }>(
    `select staff_id from public.attendance_cards where company_id=$1 and token_hash=$2`,
    [input.companyId, hash],
  );
  const staffId = card.rows[0]?.staff_id;
  if (!staffId) throw new Error("CARD_REVOKED");
  // Staff lock serializes scan, revocation, issuance and phone binding.
  const lock = await db.query<{ id: string | null }>(
    "select public.lock_staff_for_card_scan($1,$2) as id",
    [input.companyId, staffId],
  );
  if (!lock.rows[0]?.id) throw new Error("CARD_REVOKED");
  const active = await db.query<{ branch_id: string; display_name: string }>(
    `select s.branch_id,s.display_name from public.attendance_cards c
      join public.staff_members s on s.company_id=c.company_id and s.id=c.staff_id
      where c.company_id=$1 and c.token_hash=$2 and c.staff_id=$3 and c.revoked_at is null
        and public.card_staff_allowed(c.company_id,c.staff_id)`,
    [input.companyId, hash, staffId],
  );
  const row = active.rows[0];
  if (!row) throw new Error("CARD_REVOKED");
  const repo = pgAttendanceRepository(db, userId);
  const branch = await repo.branch(row.branch_id);
  if (!branch) throw new Error("FORBIDDEN");
  return {
    name: row.display_name,
    branch,
    branchId: row.branch_id,
    staffId,
    repo,
  };
}
