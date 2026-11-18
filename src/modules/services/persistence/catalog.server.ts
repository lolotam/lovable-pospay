import type pg from "pg";
import type { z } from "zod";
import type { saveServiceInput, ServiceCatalogDto } from "../contracts";

export async function readCatalog(
  db: pg.PoolClient,
  companyId: string,
): Promise<ServiceCatalogDto> {
  const access = await db.query(
    `select public.is_member($1) as member,public.catalog_manager($1) as manager`,
    [companyId],
  );
  if (!access.rows[0]?.member) throw new Error("FORBIDDEN");
  const services = await db.query(
    `select c.id,c.name,c.price_mills::text as "priceMills",c.version,
 coalesce((select json_agg(a.staff_id) from public.service_assignments a where a.company_id=c.company_id and a.service_id=c.id and a.active),'[]') as "staffIds" from public.service_catalog c where company_id=$1 order by name`,
    [companyId],
  );
  const staff = await db.query(
    `select id,display_name as name from public.staff_members where company_id=$1 order by display_name`,
    [companyId],
  );
  return { canManage: access.rows[0].manager, services: services.rows, staff: staff.rows };
}
export async function saveService(
  db: pg.PoolClient,
  userId: string,
  input: z.infer<typeof saveServiceInput>,
  priceMills: bigint,
) {
  const access = await db.query(`select public.catalog_manager($1) as manager`, [input.companyId]);
  if (!access.rows[0]?.manager) throw new Error("FORBIDDEN");
  const price = priceMills.toString();
  const staffIds = [...new Set(input.staffIds)];
  const prior = input.id
    ? await db.query(
        `select name,price_mills::text,version from public.service_catalog where company_id=$1 and id=$2 for update`,
        [input.companyId, input.id],
      )
    : null;
  if (input.id && (!prior?.rows[0] || prior.rows[0].version !== input.version))
    throw new Error("SERVICE_CONFLICT");
  const result = input.id
    ? await db.query(
        `update public.service_catalog set name=$3,price_mills=$4,version=version+1 where company_id=$1 and id=$2 returning id`,
        [input.companyId, input.id, input.name, price],
      )
    : await db.query(
        `insert into public.service_catalog(company_id,name,price_mills,id)
         values($1,$2,$3,coalesce($4::uuid,gen_random_uuid()))
         on conflict(company_id,id) do nothing returning id`,
        [input.companyId, input.name, price, input.requestId ?? null],
      );
  if (!input.id && input.requestId && !result.rowCount) {
    const { rows } = await db.query<{ matches: boolean }>(
      `select exists (
        select 1 from public.audit_log
        where company_id=$1 and actor_user_id=$2 and entity_id=$3
          and entity='service' and action='service.saved'
          and details->'previous'='null'::jsonb
          and details->>'name'=$4 and details->>'priceMills'=$5
          and (details->'staffIds') @> $6::jsonb and $6::jsonb @> (details->'staffIds')
      ) as matches`,
      [input.companyId, userId, input.requestId, input.name, price, JSON.stringify(staffIds)],
    );
    if (!rows[0]?.matches) throw new Error("SERVICE_REQUEST_CONFLICT");
    return { id: input.requestId };
  }
  const id = result.rows[0].id;
  const selected = await db.query(
    `select id from public.staff_members where company_id=$1 and id=any($2::uuid[])`,
    [input.companyId, staffIds],
  );
  if (selected.rowCount !== staffIds.length) throw new Error("FORBIDDEN");
  await db.query(
    `update public.service_assignments set active=false where company_id=$1 and service_id=$2`,
    [input.companyId, id],
  );
  await db.query(
    `insert into public.service_assignments(company_id,service_id,staff_id)
     select $1,$2,staff_id from unnest($3::uuid[]) as assigned(staff_id)
     on conflict(company_id,service_id,staff_id) do update set active=true`,
    [input.companyId, id, staffIds],
  );
  await db.query(
    `insert into public.audit_log(company_id,actor_user_id,action,entity,entity_id,details) values($1,$2,'service.saved','service',$3,$4)`,
    [
      input.companyId,
      userId,
      id,
      JSON.stringify({
        previous: prior?.rows[0] ?? null,
        name: input.name,
        priceMills: price,
        staffIds,
      }),
    ],
  );
  return { id };
}
