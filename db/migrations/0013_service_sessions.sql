-- Slice 011: record performed service sessions (D-43 client name+phone, D-49 late flag).
-- Price is the catalog snapshot; price override/discount waits on ق-1 (TODO(spec)).
create or replace function public.session_writer(_company uuid, _branch uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select (public.has_company_role(_company,'owner') or exists(select 1 from memberships where company_id=_company and user_id=public.current_app_user() and role in ('branch_manager','reception') and (branch_id is null or branch_id=_branch)))
 and not exists(select 1 from permission_overrides where company_id=_company and user_id=public.current_app_user() and permission='sessions.record' and effect='deny')
$$;
revoke all on function public.session_writer(uuid,uuid) from public;
grant execute on function public.session_writer(uuid,uuid) to pospay_app;
create or replace function public.session_writer_any(_company uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from branches b where b.company_id=_company and public.session_writer(_company,b.id))
$$;
revoke all on function public.session_writer_any(uuid) from public;
grant execute on function public.session_writer_any(uuid) to pospay_app;
create table if not exists public.clients (
 company_id uuid not null references public.companies(id) on delete cascade,
 id uuid not null default gen_random_uuid(),
 name text not null check(length(trim(name)) between 1 and 120),
 phone text not null check(phone ~ '^[0-9]{8,15}$'),
 primary key(company_id,id), unique(company_id,phone)
);
grant select,insert,update on public.clients to pospay_app;
alter table public.clients enable row level security;
drop policy if exists clients_read on public.clients;
create policy clients_read on public.clients for select to pospay_app using(public.session_writer_any(company_id) or public.report_reader(company_id));
drop policy if exists clients_insert on public.clients;
create policy clients_insert on public.clients for insert to pospay_app with check(public.session_writer_any(company_id));
drop policy if exists clients_update on public.clients;
create policy clients_update on public.clients for update to pospay_app using(public.session_writer_any(company_id)) with check(public.session_writer_any(company_id));
alter table public.service_sessions add column if not exists client_id uuid;
alter table public.service_sessions add column if not exists recorded_by text;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='service_sessions_client_fk') then
  alter table public.service_sessions add constraint service_sessions_client_fk foreign key(company_id,client_id) references public.clients(company_id,id);
 end if;
end $$;
grant insert on public.service_sessions to pospay_app;
drop policy if exists sessions_writer_read on public.service_sessions;
create policy sessions_writer_read on public.service_sessions for select to pospay_app using(public.session_writer(company_id,branch_id));
drop policy if exists sessions_insert on public.service_sessions;
create policy sessions_insert on public.service_sessions for insert to pospay_app with check(public.session_writer(company_id,branch_id) and recorded_by=public.current_app_user() and client_id is not null);
