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
  const card = await db.query(
    `select c.staff_id,s.branch_id,s.display_name from public.attendance_cards c join public.staff_members s on s.company_id=c.company_id and s.id=c.staff_id where c.company_id=$1 and c.token_hash=$2`,
    [input.companyId, hash],
  );
  const row = card.rows[0];
  if (!row) throw new Error("CARD_REVOKED");
  // Staff lock serializes scan, revocation, issuance and phone binding.
  await db.query(`select id from public.staff_members where company_id=$1 and id=$2 for update`, [
    input.companyId,
    row.staff_id,
  ]);
  const active = await db.query(
    `select c.id from public.attendance_cards c where c.company_id=$1 and c.token_hash=$2 and c.revoked_at is null and public.card_operator(c.company_id,$3)
 and public.card_staff_allowed(c.company_id,c.staff_id)`,
    [input.companyId, hash, row.branch_id],
  );
  if (!active.rows[0]) throw new Error("CARD_REVOKED");
  const repo = pgAttendanceRepository(db, userId);
  const branch = await repo.branch(row.branch_id);
  if (!branch) throw new Error("FORBIDDEN");
  return {
    name: row.display_name as string,
    branch,
    branchId: row.branch_id as string,
    staffId: row.staff_id as string,
    repo,
  };
}
