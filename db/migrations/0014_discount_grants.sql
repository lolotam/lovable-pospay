-- ق-1 / D-44: discount permission with a max percent, granted by a manager to a member or a role.
create table if not exists public.discount_grants (
 company_id uuid not null references public.companies(id) on delete cascade,
 id uuid not null default gen_random_uuid(),
 user_id text, role public.company_role,
 max_percent smallint not null check(max_percent between 1 and 100),
 granted_by text not null, created_at timestamptz not null default now(),
 primary key(company_id,id),
 check(num_nonnulls(user_id,role)=1),
 check(role is null or role not in ('owner','branch_manager'))
);
create unique index if not exists discount_grants_user_uq on public.discount_grants(company_id,user_id) where user_id is not null;
create unique index if not exists discount_grants_role_uq on public.discount_grants(company_id,role) where role is not null;
alter table public.discount_grants enable row level security;
create or replace function public.discount_manager(_company uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select public.has_company_role(_company,'owner') or public.has_company_role(_company,'branch_manager') $$;
create or replace function public.discount_cap(_company uuid) returns integer
language sql stable security definer set search_path=public as $$
 select case when public.discount_manager(_company) then 100 else coalesce((
  select max(g.max_percent) from public.discount_grants g where g.company_id=_company and (
   g.user_id=public.current_app_user() or g.role in (select m.role from public.memberships m where m.company_id=_company and m.user_id=public.current_app_user()))),0) end $$;
revoke all on function public.discount_manager(uuid) from public;
revoke all on function public.discount_cap(uuid) from public;
grant execute on function public.discount_manager(uuid) to pospay_app;
grant execute on function public.discount_cap(uuid) to pospay_app;
grant select,insert,update,delete on public.discount_grants to pospay_app;
drop policy if exists discount_grants_read on public.discount_grants;
create policy discount_grants_read on public.discount_grants for select to pospay_app using(public.discount_manager(company_id) or user_id=public.current_app_user());
drop policy if exists discount_grants_write on public.discount_grants;
create policy discount_grants_write on public.discount_grants for all to pospay_app using(public.discount_manager(company_id)) with check(public.discount_manager(company_id) and granted_by=public.current_app_user());
alter table public.service_sessions add column if not exists list_price_mills bigint check(list_price_mills>=0);
alter table public.service_sessions add column if not exists discount_reason text;
drop policy if exists sessions_insert on public.service_sessions;
create policy sessions_insert on public.service_sessions for insert to pospay_app with check(
 public.session_writer(company_id,branch_id) and recorded_by=public.current_app_user() and client_id is not null
 and list_price_mills=(select c.price_mills from public.service_catalog c where c.company_id=service_sessions.company_id and c.id=service_sessions.service_id)
 and price_mills<=list_price_mills
 and price_mills*100>=list_price_mills*(100-public.discount_cap(company_id))
 and (price_mills=list_price_mills or length(trim(coalesce(discount_reason,'')))>0));
