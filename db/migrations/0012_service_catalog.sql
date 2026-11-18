create or replace function public.catalog_manager(_company uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select public.is_company_admin(_company) and not exists(select 1 from permission_overrides where company_id=_company and user_id=public.current_app_user() and permission='services.manage' and effect='deny')
$$;
create or replace function public.report_reader(_company uuid, _branch uuid default null) returns boolean
language sql stable security definer set search_path=public as $$
 select (public.has_company_role(_company,'owner') or public.has_company_role(_company,'accountant') or public.has_company_role(_company,'viewer') or exists(select 1 from memberships where company_id=_company and user_id=public.current_app_user() and role='branch_manager' and (_branch is null or branch_id is null or branch_id=_branch)))
 and not exists(select 1 from permission_overrides where company_id=_company and user_id=public.current_app_user() and permission='reports.read' and effect='deny')
$$;
revoke all on function public.catalog_manager(uuid),public.report_reader(uuid,uuid) from public;
grant execute on function public.catalog_manager(uuid),public.report_reader(uuid,uuid) to pospay_app;
create table if not exists public.service_catalog (
 company_id uuid not null references public.companies(id) on delete cascade,
 id uuid not null default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 120),
 price_mills bigint not null check(price_mills>=0), version integer not null default 1,
 primary key(company_id,id)
);
grant select,insert,update on public.service_catalog to pospay_app;
alter table public.service_catalog enable row level security;
drop policy if exists catalog_read on public.service_catalog;
create policy catalog_read on public.service_catalog for select to pospay_app using(public.is_member(company_id));
drop policy if exists catalog_write on public.service_catalog;
create policy catalog_write on public.service_catalog for all to pospay_app using(public.catalog_manager(company_id)) with check(public.catalog_manager(company_id));
create table if not exists public.service_assignments (
 company_id uuid not null references public.companies(id) on delete cascade,
 service_id uuid not null, staff_id uuid not null, active boolean not null default true,
 primary key(company_id,service_id,staff_id),
 foreign key(company_id,service_id) references public.service_catalog(company_id,id),
 foreign key(company_id,staff_id) references public.staff_members(company_id,id)
);
grant select,insert,update on public.service_assignments to pospay_app;
alter table public.service_assignments enable row level security;
drop policy if exists assignments_read on public.service_assignments;
create policy assignments_read on public.service_assignments for select to pospay_app using(public.is_member(company_id));
drop policy if exists assignments_write on public.service_assignments;
create policy assignments_write on public.service_assignments for all to pospay_app using(public.catalog_manager(company_id)) with check(public.catalog_manager(company_id));
-- Future session writer must follow D-43/D-44/D-49; no invented/demo session rows.
create table if not exists public.service_sessions (
 company_id uuid not null references public.companies(id) on delete cascade,
 id uuid not null default gen_random_uuid(), service_id uuid not null, staff_id uuid not null,
 branch_id uuid not null, occurred_at timestamptz not null, recorded_at timestamptz not null default now(),
 service_name text not null, price_mills bigint not null check(price_mills>=0),
 primary key(company_id,id), foreign key(company_id,service_id) references public.service_catalog(company_id,id),
 foreign key(company_id,staff_id) references public.staff_members(company_id,id),
 foreign key(company_id,branch_id) references public.branches(company_id,id)
);
grant select on public.service_sessions to pospay_app;
alter table public.service_sessions enable row level security;
drop policy if exists sessions_report on public.service_sessions;
create policy sessions_report on public.service_sessions for select to pospay_app using(public.report_reader(company_id,branch_id));
drop policy if exists attendance_report on public.attendance_records;
create policy attendance_report on public.attendance_records for select to pospay_app using(public.report_reader(company_id,branch_id));

create index if not exists attendance_report_company_time
 on public.attendance_records(company_id,check_in_at desc);
create index if not exists service_report_company_time
 on public.service_sessions(company_id,occurred_at desc);
