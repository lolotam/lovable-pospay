-- Prepared only, never executed by Lovable. The source catalog lacks an active flag.
-- Add the spec's flag with existing items active; existing catalog writes stay compatible.
alter table public.service_catalog add column if not exists active boolean not null default true;
create table if not exists public.company_pages (
 company_id uuid primary key references public.companies(id) on delete cascade,
 slug text not null unique check(slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$'),
 draft jsonb not null default '{"blocks":[]}'::jsonb,
 published jsonb,published_at timestamptz,version integer not null default 1,
 updated_by text not null,updated_at timestamptz not null default now(),
 constraint company_pages_reserved_slug check(slug <> all(array['admin','app','pos','me','api','s','sign-in','invite','pospay','www']))
);
grant select,insert,update on public.company_pages to pospay_app;
revoke delete on public.company_pages from pospay_app;
alter table public.company_pages enable row level security;
drop policy if exists page_owner_select on public.company_pages;
create policy page_owner_select on public.company_pages for select to pospay_app using(public.has_company_role(company_id,'owner'));
drop policy if exists page_owner_insert on public.company_pages;
create policy page_owner_insert on public.company_pages for insert to pospay_app with check(public.has_company_role(company_id,'owner') and updated_by=public.current_app_user());
drop policy if exists page_owner_update on public.company_pages;
create policy page_owner_update on public.company_pages for update to pospay_app using(public.has_company_role(company_id,'owner')) with check(public.has_company_role(company_id,'owner') and updated_by=public.current_app_user());
create or replace function public.public_company_page(_slug text) returns jsonb
language sql stable security definer set search_path=public as $$
 select jsonb_build_object('companyName',c.name,'currency',c.currency,'document',p.published,
 'services',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'priceMills',s.price_mills::text) order by s.name,s.id) from service_catalog s where s.company_id=p.company_id and s.active),'[]'::jsonb))
 from company_pages p join companies c on c.id=p.company_id where p.slug=_slug and p.published is not null
$$;
create or replace function public.slug_available(_slug text) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from memberships m where m.user_id=public.current_app_user() and m.role='owner')
 and _slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$'
 and _slug <> all(array['admin','app','pos','me','api','s','sign-in','invite','pospay','www'])
 and not exists(select 1 from company_pages p where p.slug=_slug)
$$;
revoke all on function public.public_company_page(text),public.slug_available(text) from public;
grant execute on function public.public_company_page(text),public.slug_available(text) to pospay_app;

create table if not exists public.company_assets (
 company_id uuid not null references public.companies(id) on delete cascade,
 id uuid not null, object_key text not null unique,
 content_type text not null check(content_type in ('image/png','image/jpeg','image/webp')),
 byte_size integer not null check(byte_size between 1 and 2097152),
 alt jsonb not null default '{"ar":"","en":""}'::jsonb,
 created_by text not null, created_at timestamptz not null default now(),
 primary key(company_id,id), unique(id)
);
grant select,insert,delete on public.company_assets to pospay_app;
alter table public.company_assets enable row level security;
drop policy if exists asset_owner_select on public.company_assets;
create policy asset_owner_select on public.company_assets for select to pospay_app using(public.has_company_role(company_id,'owner'));
drop policy if exists asset_owner_insert on public.company_assets;
create policy asset_owner_insert on public.company_assets for insert to pospay_app with check(public.has_company_role(company_id,'owner') and created_by=public.current_app_user());
drop policy if exists asset_owner_delete on public.company_assets;
create policy asset_owner_delete on public.company_assets for delete to pospay_app using(public.has_company_role(company_id,'owner'));
create or replace function public.page_asset_ids(_doc jsonb) returns setof uuid
language sql immutable set search_path=public as $$
 select (_doc->>'logoAssetId')::uuid where _doc->>'logoAssetId' is not null
 union select (_doc->>'heroImageAssetId')::uuid where _doc->>'heroImageAssetId' is not null
 union select (i->>'assetId')::uuid from jsonb_array_elements(coalesce(_doc->'blocks','[]'::jsonb)) b,
 lateral jsonb_array_elements(coalesce(b->'images','[]'::jsonb)) i where b->>'type'='gallery'
$$;
create or replace function public.public_asset(_id uuid) returns table(object_key text,content_type text)
language sql stable security definer set search_path=public as $$
 select a.object_key,a.content_type from company_assets a join company_pages p using(company_id)
 where a.id=_id and p.published is not null
 and a.id in(select public.page_asset_ids(p.published))
$$;
revoke all on function public.public_asset(uuid),public.page_asset_ids(jsonb) from public;
grant execute on function public.public_asset(uuid),public.page_asset_ids(jsonb) to pospay_app;
