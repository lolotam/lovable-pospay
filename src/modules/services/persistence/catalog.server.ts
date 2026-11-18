import type pg from "pg";
import type {
  CatalogDetails,
  CatalogReader,
  CatalogSnapshot,
  CatalogWriter,
} from "../ports/catalog-repository";

export function pgCatalogReader(db: pg.PoolClient, companyId: string): CatalogReader {
  return {
    async access() {
      const { rows } = await db.query<{ member: boolean; manager: boolean }>(
        `select public.is_member($1) as member,public.catalog_manager($1) as manager`,
        [companyId],
      );
      return rows[0];
    },
    async read() {
      const { rows: services } = await db.query<
        Omit<CatalogDetails, "priceMills"> & { id: string; version: number; priceMills: string }
      >(
        `select c.id,c.name,c.price_mills::text as "priceMills",c.version,
         coalesce((select json_agg(a.staff_id) from public.service_assignments a
          where a.company_id=c.company_id and a.service_id=c.id and a.active),'[]') as "staffIds"
         from public.service_catalog c where c.company_id=$1 order by c.name`,
        [companyId],
      );
      const { rows: staff } = await db.query(
        "select id,display_name as name from public.staff_members where company_id=$1 order by display_name",
        [companyId],
      );
      return {
        services: services.map((service) => ({
          ...service,
          priceMills: BigInt(service.priceMills),
        })),
        staff,
      };
    },
  };
}

export function pgCatalogWriter(
  db: pg.PoolClient,
  userId: string,
  companyId: string,
): CatalogWriter {
  return {
    async canManage() {
      const { rows } = await db.query<{ manager: boolean }>(
        "select public.catalog_manager($1) as manager",
        [companyId],
      );
      return !!rows[0]?.manager;
    },
    async lock(id) {
      const { rows } = await db.query<Omit<CatalogSnapshot, "priceMills"> & { priceMills: string }>(
        `select name,price_mills::text as "priceMills",version from public.service_catalog where company_id=$1 and id=$2 for update`,
        [companyId, id],
      );
      const row = rows[0];
      return row && { ...row, priceMills: BigInt(row.priceMills) };
    },
    async update(id, details) {
      const result = await db.query(
        "update public.service_catalog set name=$3,price_mills=$4,version=version+1 where company_id=$1 and id=$2",
        [companyId, id, details.name, details.priceMills.toString()],
      );
      if (result.rowCount !== 1) throw new Error("SERVICE_CONFLICT");
    },
    async create(details, requestId) {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.service_catalog(company_id,name,price_mills,id)
         values($1,$2,$3,coalesce($4::uuid,gen_random_uuid()))
         on conflict(company_id,id) do nothing returning id`,
        [companyId, details.name, details.priceMills.toString(), requestId ?? null],
      );
      return rows[0]?.id ?? null;
    },
    matchesCreation: (id, details) => matchesCreation(db, companyId, userId, id, details),
    replaceAssignments: (id, staffIds) => replaceAssignments(db, companyId, id, staffIds),
    audit: (id, previous, details) =>
      auditCatalogSave(db, companyId, userId, id, previous, details),
  };
}

async function auditCatalogSave(
  db: pg.PoolClient,
  companyId: string,
  userId: string,
  id: string,
  previous: CatalogSnapshot | null,
  details: CatalogDetails,
) {
  await db.query(
    `insert into public.audit_log(company_id,actor_user_id,action,entity,entity_id,details)
     values($1,$2,'service.saved','service',$3,$4)`,
    [
      companyId,
      userId,
      id,
      JSON.stringify({
        previous: previous && {
          name: previous.name,
          version: previous.version,
          price_mills: previous.priceMills.toString(),
        },
        ...details,
        priceMills: details.priceMills.toString(),
      }),
    ],
  );
}

async function matchesCreation(
  db: pg.PoolClient,
  companyId: string,
  userId: string,
  id: string,
  details: CatalogDetails,
) {
  const { rows } = await db.query<{ matches: boolean }>(
    `select exists (
        select 1 from public.audit_log
        where company_id=$1 and actor_user_id=$2 and entity_id=$3
          and entity='service' and action='service.saved'
          and details->'previous'='null'::jsonb
          and details->>'name'=$4 and details->>'priceMills'=$5
          and (details->'staffIds') @> $6::jsonb and $6::jsonb @> (details->'staffIds')
      ) as matches`,
    [
      companyId,
      userId,
      id,
      details.name,
      details.priceMills.toString(),
      JSON.stringify(details.staffIds),
    ],
  );
  return !!rows[0]?.matches;
}

async function replaceAssignments(
  db: pg.PoolClient,
  companyId: string,
  id: string,
  staffIds: string[],
) {
  const selected = await db.query(
    "select id from public.staff_members where company_id=$1 and id=any($2::uuid[])",
    [companyId, staffIds],
  );
  if (selected.rowCount !== staffIds.length) return false;
  const cleared = await db.query<{ complete: boolean }>(
    `with existing as materialized (
       select 1 from public.service_assignments where company_id=$1 and service_id=$2 and active
     ), updated as (
       update public.service_assignments set active=false where company_id=$1 and service_id=$2 and active returning 1
     )
     select (select count(*) from existing)=(select count(*) from updated) as complete`,
    [companyId, id],
  );
  if (!cleared.rows[0]?.complete) return false;
  await db.query(
    `insert into public.service_assignments(company_id,service_id,staff_id)
       select $1,$2,staff_id from unnest($3::uuid[]) as assigned(staff_id)
       on conflict(company_id,service_id,staff_id) do update set active=true`,
    [companyId, id, staffIds],
  );
  return true;
}
