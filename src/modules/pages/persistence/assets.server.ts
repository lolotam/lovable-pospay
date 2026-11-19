import type pg from "pg";
import { assertAssetUnused, assertOwnedAssets, referencedAssets } from "../domain/assets";
import type { PageDocument } from "../contracts";
import type { AssetRepository } from "../ports/asset-repository";
export async function lockPageAssets(db: pg.PoolClient, companyId: string) {
  await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`page-assets:${companyId}`]);
}
export async function validateDocumentAssets(db: pg.PoolClient, companyId: string, doc: PageDocument) {
  await lockPageAssets(db, companyId);
  const ids = referencedAssets(doc);
  const rows = await db.query("select id from public.company_assets where company_id=$1 and id=any($2::uuid[])", [companyId, ids]);
  assertOwnedAssets(ids, rows.rows.map(row => row.id));
}
export function pgAssetRepository(db: pg.PoolClient, companyId: string, userId: string): AssetRepository {
  return {
    lock: () => lockPageAssets(db, companyId),
    async isOwner() {
      const result = await db.query("select public.has_company_role($1,'owner') as allowed", [companyId]);
      return result.rows[0]?.allowed === true;
    },
    async list() {
      const result = await db.query('select id,content_type as "contentType",byte_size as "byteSize",alt from public.company_assets where company_id=$1 order by created_at,id', [companyId]);
      return result.rows;
    },
    async insert(asset, key) {
      await db.query("insert into public.company_assets(company_id,id,object_key,content_type,byte_size,alt,created_by) values($1,$2,$3,$4,$5,$6::jsonb,$7)", [companyId, asset.id, key, asset.contentType, asset.byteSize, JSON.stringify(asset.alt), userId]);
    },
    async remove(id) {
      const pages = await db.query("select draft,published from public.company_pages where company_id=$1", [companyId]);
      assertAssetUnused(id, pages.rows.flatMap(row => [row.draft, row.published].filter(Boolean)));
      const result = await db.query("delete from public.company_assets where company_id=$1 and id=$2 returning object_key", [companyId, id]);
      if (!result.rows[0]) throw new Error("ASSET_NOT_FOUND");
      return result.rows[0].object_key;
    },
  };
}
export async function readMediaAsset(db: pg.PoolClient, id: string) {
  const published = await db.query("select * from public.public_asset($1)", [id]);
  if (published.rows[0]) return published.rows[0] as { object_key: string; content_type: string };
  const own = await db.query("select object_key,content_type from public.company_assets where id=$1", [id]);
  return own.rows[0] as { object_key: string; content_type: string } | undefined;
}
