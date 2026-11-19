create table if not exists public.commission_plans (
  company_id uuid not null references public.companies(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  created_by text not null,
  created_at timestamptz not null default now(),
  primary key (company_id, id),
  unique (company_id, name)
);

create table if not exists public.commission_plan_versions (
  company_id uuid not null references public.companies(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  plan_id uuid not null,
  version integer not null check (version >= 1),
  effective_month date not null check (extract(day from effective_month) = 1),
  base_rate_bp integer check (base_rate_bp between 1 and 10000),
  tier_mode text check (tier_mode in ('excess','all_after')),
  tier_rate_bp integer check (tier_rate_bp between 1 and 10000),
  tier_threshold_mills bigint check (tier_threshold_mills >= 0),
  tier_salary_multiple_milli integer check (tier_salary_multiple_milli > 0),
  created_by text not null,
  created_at timestamptz not null default now(),
  primary key (company_id, id),
  unique (company_id, plan_id, version),
  foreign key (company_id, plan_id) references public.commission_plans(company_id, id),
  check (base_rate_bp is not null or tier_mode is not null),
  check ((tier_mode is null) = (tier_rate_bp is null)),
  check (tier_mode is null
         or (tier_threshold_mills is null) <> (tier_salary_multiple_milli is null)),
  check (tier_mode is not null
         or (tier_threshold_mills is null and tier_salary_multiple_milli is null))
);

create table if not exists public.staff_commission_plans (
  company_id uuid not null references public.companies(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  staff_id uuid not null,
  plan_id uuid not null,
  effective_month date not null check (extract(day from effective_month) = 1),
  assigned_by text not null,
  assigned_at timestamptz not null default now(),
  primary key (company_id, id),
  foreign key (company_id, staff_id) references public.staff_members(company_id, id),
  foreign key (company_id, plan_id) references public.commission_plans(company_id, id)
);

create index if not exists staff_commission_plans_resolution
  on public.staff_commission_plans(company_id, staff_id, effective_month desc, assigned_at desc);

create or replace function public.commission_plan_manager(_company uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select public.has_company_role(_company, 'owner')
      or public.has_company_role(_company, 'branch_manager')
$$;

create or replace function public.commission_plan_assigner(_company uuid, _staff uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.has_company_role(_company, 'owner')
      or exists (
        select 1
        from public.memberships m
        join public.staff_members s
          on s.company_id = m.company_id and s.id = _staff
        where m.company_id = _company
          and m.user_id = public.current_app_user()
          and m.role = 'branch_manager'
          and (m.branch_id is null or m.branch_id = s.branch_id)
      )
$$;

revoke all on function public.commission_plan_manager(uuid) from public;
revoke all on function public.commission_plan_assigner(uuid, uuid) from public;
grant execute on function public.commission_plan_manager(uuid) to pospay_app;
grant execute on function public.commission_plan_assigner(uuid, uuid) to pospay_app;

grant select, insert on public.commission_plans to pospay_app;
grant select, insert on public.commission_plan_versions to pospay_app;
grant select, insert on public.staff_commission_plans to pospay_app;

alter table public.commission_plans enable row level security;
alter table public.commission_plan_versions enable row level security;
alter table public.staff_commission_plans enable row level security;

drop policy if exists commission_plans_select on public.commission_plans;
create policy commission_plans_select on public.commission_plans for select to pospay_app
  using (public.commission_plan_manager(company_id));
drop policy if exists commission_plans_insert on public.commission_plans;
create policy commission_plans_insert on public.commission_plans for insert to pospay_app
  with check (public.commission_plan_manager(company_id) and created_by = public.current_app_user());

drop policy if exists commission_plan_versions_select on public.commission_plan_versions;
create policy commission_plan_versions_select on public.commission_plan_versions for select to pospay_app
  using (public.commission_plan_manager(company_id));
drop policy if exists commission_plan_versions_insert on public.commission_plan_versions;
create policy commission_plan_versions_insert on public.commission_plan_versions for insert to pospay_app
  with check (public.commission_plan_manager(company_id) and created_by = public.current_app_user());

drop policy if exists staff_commission_plans_select on public.staff_commission_plans;
create policy staff_commission_plans_select on public.staff_commission_plans for select to pospay_app
  using (public.commission_plan_manager(company_id));
drop policy if exists staff_commission_plans_insert on public.staff_commission_plans;
create policy staff_commission_plans_insert on public.staff_commission_plans for insert to pospay_app
  with check (public.commission_plan_assigner(company_id, staff_id) and assigned_by = public.current_app_user());
