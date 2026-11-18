import type pg from "pg";
import type { CardScanReceipt, CardScanReceipts } from "../ports/card-scan-receipts";

/** يربط نتيجة المسح بالشركة والمشغّل ومعرّف المحاولة. */
export function pgCardScanReceipts<Result>(
  db: pg.PoolClient,
  companyId: string,
  userId: string,
  requestId: string,
): CardScanReceipts<Result> {
  return {
    async lockAndRead() {
      await db.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
        JSON.stringify(["card-scan", companyId.toLowerCase(), userId, requestId.toLowerCase()]),
      ]);
      const { rows } = await db.query<CardScanReceipt<Result>>(
        "select fingerprint, result from public.card_scan_requests where company_id=$1 and actor_user_id=$2 and id=$3",
        [companyId, userId, requestId],
      );
      return rows[0];
    },
    async save(receipt) {
      await db.query(
        "insert into public.card_scan_requests(company_id,actor_user_id,id,fingerprint,result) values($1,$2,$3,$4,$5)",
        [companyId, userId, requestId, receipt.fingerprint, JSON.stringify(receipt.result)],
      );
      await db.query("select public.prune_card_scan_requests()");
    },
  };
}
