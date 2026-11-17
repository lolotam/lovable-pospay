-- PosPay Phase 1 — tenancy foundation (self-hosted Supabase Postgres).
-- Run AFTER Better Auth tables exist (`bunx @better-auth/cli migrate`).
-- Identity comes from Better Auth; the app sets `app.user_id` per transaction
-- and switches to role `pospay_app` (no BYPASSRLS), so RLS isolates companies.

create extension if not exists pgcrypto;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'pospay_app') then
    create role pospay_app nologin noinherit;
  end if;
end $$;

-- Role codes are provisional until D-07 is confirmed.
do $$ begin
  create type public.company_role as enum
    ('owner','branch_manager','reception','staff','accountant','viewer');
exception when duplicate_object then null; end $$;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  currency text not null default 'KWD',
  created_at timestamptz not null default now()
);

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  timezone text not null default 'Asia/Kuwait',          -- D-10
  latitude numeric(9,6),
  longitude numeric(9,6),
  geofence_meters integer not null default 150,          -- D-12
  created_at timestamptz not null default now()
);

-- Roles live in their own table, never on the user row.
create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id text not null,                                  -- Better Auth user.id
  role public.company_role not null,
  branch_id uuid references public.branches(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (company_id, user_id, role)
);

-- D-31 / D-46: per-person allow/deny; deny wins.
create table if not exists public.permission_overrides (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id text not null,
  permission text not null,
  effect text not null check (effect in ('allow','deny')),
  created_at timestamptz not null default now(),
  unique (company_id, user_id, permission, effect)
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  actor_user_id text not null,
  action text not null,
  entity text,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Helpers -------------------------------------------------------------------
create or replace function public.current_app_user() returns text
language sql stable as $$ select nullif(current_setting('app.user_id', true), '') $$;

create or replace function public.is_member(_company uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships
                 where company_id = _company and user_id = public.current_app_user())
$$;

create or replace function public.has_company_role(_company uuid, _role public.company_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships
                 where company_id = _company and user_id = public.current_app_user()
                   and role = _role)
$$;

-- Grants ------------------------------------------------------------------
grant usage on schema public to pospay_app;
grant select on public.companies, public.branches, public.memberships,
              public.permission_overrides to pospay_app;
grant insert, update, delete on public.branches, public.memberships,
              public.permission_overrides to pospay_app;
grant update on public.companies to pospay_app;
grant select, insert on public.audit_log to pospay_app;
grant execute on function public.current_app_user(), public.is_member(uuid),
  public.has_company_role(uuid, public.company_role) to pospay_app;

-- RLS ---------------------------------------------------------------------
alter table public.companies enable row level security;
alter table public.branches enable row level security;
alter table public.memberships enable row level security;
alter table public.permission_overrides enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists companies_member_read on public.companies;
create policy companies_member_read on public.companies for select to pospay_app
  using (public.is_member(id));
drop policy if exists companies_owner_update on public.companies;
create policy companies_owner_update on public.companies for update to pospay_app
  using (public.has_company_role(id, 'owner'));

drop policy if exists branches_member_read on public.branches;
create policy branches_member_read on public.branches for select to pospay_app
  using (public.is_member(company_id));
drop policy if exists branches_admin_write on public.branches;
create policy branches_admin_write on public.branches for all to pospay_app
  using (public.has_company_role(company_id, 'owner') or public.has_company_role(company_id, 'branch_manager'))
  with check (public.has_company_role(company_id, 'owner') or public.has_company_role(company_id, 'branch_manager'));

drop policy if exists memberships_read on public.memberships;
create policy memberships_read on public.memberships for select to pospay_app
  using (user_id = public.current_app_user()
         or public.has_company_role(company_id, 'owner')
         or public.has_company_role(company_id, 'branch_manager'));
drop policy if exists memberships_owner_write on public.memberships;
create policy memberships_owner_write on public.memberships for all to pospay_app
  using (public.has_company_role(company_id, 'owner'))
  with check (public.has_company_role(company_id, 'owner'));

drop policy if exists overrides_read on public.permission_overrides;
create policy overrides_read on public.permission_overrides for select to pospay_app
  using (user_id = public.current_app_user() or public.has_company_role(company_id, 'owner'));
drop policy if exists overrides_owner_write on public.permission_overrides;
create policy overrides_owner_write on public.permission_overrides for all to pospay_app
  using (public.has_company_role(company_id, 'owner'))
  with check (public.has_company_role(company_id, 'owner'));

drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log for select to pospay_app
  using (public.has_company_role(company_id, 'owner') or public.has_company_role(company_id, 'branch_manager'));
drop policy if exists audit_insert on public.audit_log;
create policy audit_insert on public.audit_log for insert to pospay_app
  with check (public.is_member(company_id) and actor_user_id = public.current_app_user());
