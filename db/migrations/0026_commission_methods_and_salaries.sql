-- 021: multi-method commission plans (base %, fixed per session, tiers by
-- sales amount or session count), service/staff overrides, branch-scoped
-- effective-dated salaries.

-- commission_plan_versions gains the new methods ------------------------------

alter table public.commission_plan_versions
  add column if not exists base_fixed_mills bigint check (base_fixed_mills > 0);
alter table public.commission_plan_versions
  add column if not exists tier_accumulator text
  check (tier_accumulator in ('sales_amount','session_count'));

-- Drop the 4 anonymous table-level check pairs from 0024; they reject every
-- multi-tier version. Anchored regex so column checks never match.
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.commission_plan_versions'::regclass
      and contype = 'c'
      and conname ~ '^commission_plan_versions_check[0-9]*$'
  loop
    execute format('alter table public.commission_plan_versions drop constraint %I', r.conname);
  end loop;
end $$;

-- Legacy single-tier rows keep resolving after 0026 (acceptance: backfill).
update public.commission_plan_versions
set tier_accumulator = 'sales_amount'
where tier_mode is not null and tier_accumulator is null;

do $$ begin
 if not exists(select 1 from pg_constraint where conname='commission_plan_versions_has_rule' and conrelid='public.commission_plan_versions'::regclass) then
  alter table public.commission_plan_versions add constraint commission_plan_versions_has_rule
   check (base_rate_bp is not null or base_fixed_mills is not null or tier_mode is not null);
 end if;
end $$;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='commission_plan_versions_tier_pair' and conrelid='public.commission_plan_versions'::regclass) then
  alter table public.commission_plan_versions add constraint commission_plan_versions_tier_pair
   check ((tier_mode is null) = (tier_accumulator is null));
 end if;
end $$;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='commission_plan_versions_session_excess' and conrelid='public.commission_plan_versions'::regclass) then
  alter table public.commission_plan_versions add constraint commission_plan_versions_session_excess
   check (tier_accumulator <> 'session_count' or tier_mode = 'excess');
 end if;
end $$;

-- Tiers (append-only; a version's tiers are written only in the transaction
-- that created the version) ---------------------------------------------------

create table if not exists public.commission_plan_tiers (
  company_id uuid not null references public.companies(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  version_id uuid not null,
  tier_order smallint not null check (tier_order between 1 and 20),
  rate_bp integer check (rate_bp between 1 and 10000),
  fixed_mills bigint check (fixed_mills > 0),
  threshold_mills bigint check (threshold_mills >= 0),
  threshold_salary_multiple_milli integer check (threshold_salary_multiple_milli > 0),
  threshold_session_count integer check (threshold_session_count >= 0),
  primary key (company_id, id),
  unique (company_id, version_id, tier_order),
  foreign key (company_id, version_id) references public.commission_plan_versions(company_id, id),
  check (num_nonnulls(rate_bp, fixed_mills) = 1),
  check (num_nonnulls(threshold_mills, threshold_salary_multiple_milli, threshold_session_count) = 1),
  check (fixed_mills is null or threshold_session_count is not null)
);

-- Backfill legacy single-tier versions (idempotent via the not exists guard).
insert into public.commission_plan_tiers
  (company_id, version_id, tier_order, rate_bp,
   threshold_mills, threshold_salary_multiple_milli)
select v.company_id, v.id, 1, v.tier_rate_bp,
       v.tier_threshold_mills,
       v.tier_salary_multiple_milli
from public.commission_plan_versions v
where v.tier_mode is not null
  and (v.tier_threshold_mills is not null or v.tier_salary_multiple_milli is not null)
  and not exists (select 1 from public.commission_plan_tiers t
                  where t.company_id = v.company_id and t.version_id = v.id);

grant select, insert on public.commission_plan_tiers to pospay_app;
alter table public.commission_plan_tiers enable row level security;
drop policy if exists commission_plan_tiers_select on public.commission_plan_tiers;
create policy commission_plan_tiers_select on public.commission_plan_tiers
  for select to pospay_app
  using (public.commission_plan_manager(company_id));
-- now() is transaction start: only tiers of a version created in the current
-- transaction pass, so a committed version can never gain extra tiers.
drop policy if exists commission_plan_tiers_insert on public.commission_plan_tiers;
create policy commission_plan_tiers_insert on public.commission_plan_tiers
  for insert to pospay_app
  with check (public.commission_plan_manager(company_id) and exists (
    select 1 from public.commission_plan_versions v
    where v.company_id = commission_plan_tiers.company_id
      and v.id = commission_plan_tiers.version_id
      and v.created_at = now()));

-- Service / staff-service overrides (Rule O5: effective_from is set by the
-- database at save time and can never be backdated or scheduled) --------------

create table if not exists public.service_commission_overrides (
  company_id uuid not null references public.companies(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  service_id uuid not null,
  staff_id uuid,
  effective_from timestamptz not null default clock_timestamp(),
  override_kind text not null check (override_kind in ('rate_bp','fixed_mills','clear')),
  rate_bp integer check (rate_bp between 0 and 10000),
  fixed_mills bigint check (fixed_mills >= 0),
  created_by text not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (company_id, id),
  foreign key (company_id, service_id) references public.service_catalog(company_id, id),
  foreign key (company_id, staff_id) references public.staff_members(company_id, id),
  check ((override_kind = 'rate_bp') = (rate_bp is not null)),
  check ((override_kind = 'fixed_mills') = (fixed_mills is not null))
);
create index if not exists service_commission_overrides_resolution
  on public.service_commission_overrides
  (company_id, service_id, staff_id, effective_from desc, id desc);

create or replace function public.commission_override_manager(_company uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_company_role(_company, 'owner')
    or (public.has_company_role(_company, 'branch_manager')
        and public.has_permission(_company, 'commissions.overrides.manage'))
$$;
revoke all on function public.commission_override_manager(uuid) from public;
grant execute on function public.commission_override_manager(uuid) to pospay_app;

create or replace function public.commission_staff_override_manager(_company uuid, _staff uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.commission_override_manager(_company)
    and (public.has_company_role(_company, 'owner')
         or exists (
           select 1
           from public.memberships m
           join public.staff_members s
             on s.company_id = m.company_id and s.id = _staff
           where m.company_id = _company
             and m.user_id = public.current_app_user()
             and m.role = 'branch_manager'
             and (m.branch_id is null or m.branch_id = s.branch_id)))
$$;
revoke all on function public.commission_staff_override_manager(uuid,uuid) from public;
grant execute on function public.commission_staff_override_manager(uuid,uuid) to pospay_app;

grant select, insert on public.service_commission_overrides to pospay_app;
alter table public.service_commission_overrides enable row level security;
drop policy if exists service_commission_overrides_select on public.service_commission_overrides;
create policy service_commission_overrides_select on public.service_commission_overrides
  for select to pospay_app
  using ((staff_id is null and public.commission_plan_manager(company_id))
      or (staff_id is not null and public.commission_plan_assigner(company_id, staff_id)));
drop policy if exists service_commission_overrides_insert on public.service_commission_overrides;
create policy service_commission_overrides_insert on public.service_commission_overrides
  for insert to pospay_app
  with check (created_by = public.current_app_user()
    and effective_from between now() and clock_timestamp()
    and ((staff_id is null and public.commission_override_manager(company_id))
      or (staff_id is not null and public.commission_staff_override_manager(company_id, staff_id))));

-- Branch-scoped effective-dated salaries (Q2) ---------------------------------

create table if not exists public.staff_salaries (
  company_id uuid not null references public.companies(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  staff_id uuid not null,
  salary_mills bigint not null check (salary_mills > 0),
  effective_date date not null,
  recorded_by text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  primary key (company_id, id),
  foreign key (company_id, staff_id) references public.staff_members(company_id, id)
);
create index if not exists staff_salaries_resolution
  on public.staff_salaries(company_id, staff_id, effective_date desc, recorded_at desc);

create or replace function public.salary_manager(_company uuid, _staff uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_company_role(_company, 'owner')
    or exists (
      select 1
      from public.memberships m
      join public.staff_members s
        on s.company_id = m.company_id and s.id = _staff
      where m.company_id = _company
        and m.user_id = public.current_app_user()
        and m.role = 'branch_manager'
        and (m.branch_id is null or m.branch_id = s.branch_id))
$$;
revoke all on function public.salary_manager(uuid,uuid) from public;
grant execute on function public.salary_manager(uuid,uuid) to pospay_app;

grant select, insert on public.staff_salaries to pospay_app;
alter table public.staff_salaries enable row level security;
drop policy if exists staff_salaries_select on public.staff_salaries;
create policy staff_salaries_select on public.staff_salaries
  for select to pospay_app
  using (public.salary_manager(company_id, staff_id));
drop policy if exists staff_salaries_insert on public.staff_salaries;
create policy staff_salaries_insert on public.staff_salaries
  for insert to pospay_app
  with check (public.salary_manager(company_id, staff_id)
              and recorded_by = public.current_app_user());

-- S4: every salary insert writes its own audit row at the database level.
create or replace function public.staff_salary_audit()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log(company_id, actor_user_id, action, entity, entity_id, details)
  values (new.company_id, new.recorded_by, 'staff_salary.recorded', 'staff_salaries',
          new.id::text,
          jsonb_build_object('staffId', new.staff_id, 'salaryMills', new.salary_mills,
                             'effectiveDate', new.effective_date));
  return new;
end
$$;
revoke all on function public.staff_salary_audit() from public;
drop trigger if exists staff_salaries_audit on public.staff_salaries;
create trigger staff_salaries_audit after insert on public.staff_salaries
  for each row execute function public.staff_salary_audit();
