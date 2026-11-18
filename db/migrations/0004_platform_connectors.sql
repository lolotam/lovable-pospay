-- PosPay — platform-level AI and API connectors, editable by super admins only.
-- Platform tables have no company_id: they belong to the PosPay operator, not a salon.
-- Super admins are added by the database owner only (no app path can insert them).

create table if not exists public.platform_admins (
  user_id text primary key,                 -- Better Auth user.id
  created_at timestamptz not null default now()
);

create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.platform_admins
     where user_id = current_setting('app.user_id', true)
  )
$$;

create table if not exists public.platform_credentials (
  provider text primary key,
  kind text not null check (kind in ('account','api_key')),
  secret text not null,                     -- AES-GCM ciphertext, never plaintext
  refresh_secret text,
  expires_at timestamptz,
  extras jsonb not null default '{}'::jsonb,
  updated_by text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_logins (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  state text not null,                      -- AES-GCM ciphertext
  created_by text not null,
  expires_at timestamptz not null
);

create table if not exists public.platform_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_audit_log (
  id bigint generated always as identity primary key,
  actor_user_id text not null,
  action text not null,
  provider text,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;
alter table public.platform_credentials enable row level security;
alter table public.platform_logins enable row level security;
alter table public.platform_settings enable row level security;
alter table public.platform_audit_log enable row level security;

drop policy if exists platform_admins_self on public.platform_admins;
create policy platform_admins_self on public.platform_admins for select
  using (user_id = current_setting('app.user_id', true));

drop policy if exists platform_credentials_super on public.platform_credentials;
create policy platform_credentials_super on public.platform_credentials for all
  using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists platform_logins_super on public.platform_logins;
create policy platform_logins_super on public.platform_logins for all
  using (public.is_super_admin() and created_by = current_setting('app.user_id', true))
  with check (public.is_super_admin() and created_by = current_setting('app.user_id', true));
drop policy if exists platform_settings_super on public.platform_settings;
create policy platform_settings_super on public.platform_settings for all
  using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists platform_audit_read on public.platform_audit_log;
create policy platform_audit_read on public.platform_audit_log for select using (public.is_super_admin());
drop policy if exists platform_audit_write on public.platform_audit_log;
create policy platform_audit_write on public.platform_audit_log for insert
  with check (public.is_super_admin() and actor_user_id = current_setting('app.user_id', true));

grant select on public.platform_admins to pospay_app;
grant select, insert, update, delete on public.platform_credentials, public.platform_logins,
  public.platform_settings to pospay_app;
grant select, insert on public.platform_audit_log to pospay_app;
grant execute on function public.is_super_admin() to pospay_app;
