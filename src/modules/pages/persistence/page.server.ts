import type pg from "pg";
import { validateDocumentAssets, lockPageAssets } from "./assets.server";
import {
  pageDraftSchema,
  publicPageSchema,
  type PageDraftDto,
  type SavePageInput,
} from "../contracts";
import type { PageRepository, PublicPageReader } from "../ports/page-repository";
export function pgPageRepository(
  db: pg.PoolClient,
  companyId: string,
  userId: string,
): PageRepository {
  return {
    async isOwner() {
      const result = await db.query("select public.has_company_role($1,'owner') as allowed", [
        companyId,
      ]);
      return result.rows[0]?.allowed === true;
    },
    draft: () => readDraft(db, companyId),
    save: (input) => saveDocument(db, companyId, userId, input),
    async publish(version) {
      await lockPageAssets(db, companyId);
      const result = await db.query(
        "update public.company_pages set published=draft,published_at=now(),version=version+1,updated_by=$2,updated_at=now() where company_id=$1 and version=$3 returning version",
        [companyId, userId, version],
      );
      if (result.rowCount !== 1) throw new Error("PAGE_CONFLICT");
      return readDraft(db, companyId);
    },
    async unpublish() {
      await lockPageAssets(db, companyId);
      await db.query(
        "update public.company_pages set published=null,published_at=null,version=version+1,updated_by=$2,updated_at=now() where company_id=$1",
        [companyId, userId],
      );
      return readDraft(db, companyId);
    },
    async available(slug) {
      const own = await db.query(
        "select exists(select 1 from public.company_pages where company_id=$1 and slug=$2) as own",
        [companyId, slug],
      );
      if (own.rows[0]?.own) return true;
      const result = await db.query("select public.slug_available($1) as available", [slug]);
      return result.rows[0]?.available === true;
    },
    async audit(action, version) {
      await db.query(
        "insert into public.audit_log(company_id,actor_user_id,action,entity,entity_id,details) values($1,$2,$3,'company_page',$1,$4::jsonb)",
        [companyId, userId, action, JSON.stringify({ version })],
      );
    },
  };
}
async function readDraft(db: pg.PoolClient, companyId: string): Promise<PageDraftDto> {
  const page = await db.query(
    "select slug,draft as document,version,published_at from public.company_pages where company_id=$1",
    [companyId],
  );
  const company = await db.query("select name,currency from public.companies where id=$1", [
    companyId,
  ]);
  if (!company.rows[0]) throw new Error("FORBIDDEN");
  const services = await db.query(
    'select id,name,price_mills::text as "priceMills" from public.service_catalog where company_id=$1 and active order by name,id',
    [companyId],
  );
  const row = page.rows[0];
  return pageDraftSchema.parse({
    slug: row?.slug ?? "",
    document: row?.document ?? { blocks: [] },
    version: row?.version ?? 0,
    publishedAt: row?.published_at?.toISOString() ?? null,
    companyName: company.rows[0].name,
    currency: company.rows[0].currency,
    services: services.rows,
  });
}
export function pgPublicPageReader(db: pg.PoolClient): PublicPageReader {
  return {
    async read(slug) {
      const result = await db.query("select public.public_company_page($1) as page", [slug]);
      return result.rows[0]?.page ? publicPageSchema.parse(result.rows[0].page) : null;
    },
  };
}

async function saveDocument(
  db: pg.PoolClient,
  companyId: string,
  userId: string,
  input: SavePageInput,
) {
  await validateDocumentAssets(db, companyId, input.document);
  try {
    const result =
      input.version === 0
        ? await db.query(
            "insert into public.company_pages(company_id,slug,draft,updated_by) values($1,$2,$3::jsonb,$4) on conflict(company_id) do nothing returning version",
            [companyId, input.slug, JSON.stringify(input.document), userId],
          )
        : await db.query(
            "update public.company_pages set slug=$2,draft=$3::jsonb,version=version+1,updated_by=$4,updated_at=now() where company_id=$1 and version=$5 returning version",
            [companyId, input.slug, JSON.stringify(input.document), userId, input.version],
          );
    if (result.rowCount !== 1) throw new Error("PAGE_CONFLICT");
    return readDraft(db, companyId);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505")
      throw new Error("SLUG_TAKEN");
    throw error;
  }
}
