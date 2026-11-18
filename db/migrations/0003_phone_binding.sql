create table if not exists public.phone_bindings (
  company_id uuid not null references public.companies(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  user_id text not null,
  credential_id text not null,
  device_hash text not null unique,
  created_at timestamptz not null default now(),
  primary key (company_id,id),
  unique (company_id,user_id)
);
grant select, insert, delete on public.phone_bindings to pospay_app;
alter table public.phone_bindings enable row level security;
drop policy if exists phone_read on public.phone_bindings;
create policy phone_read on public.phone_bindings for select to pospay_app
  using (public.is_member(company_id) and (user_id=public.current_app_user() or public.is_company_admin(company_id)));
drop policy if exists phone_bind on public.phone_bindings;
create policy phone_bind on public.phone_bindings for insert to pospay_app
  with check (user_id=public.current_app_user() and public.my_staff_id(company_id) is not null
    and not exists (select 1 from public.permission_overrides where company_id=phone_bindings.company_id
      and user_id=public.current_app_user() and permission='attendance.record' and effect='deny'));
drop policy if exists phone_unbind on public.phone_bindings;
create policy phone_unbind on public.phone_bindings for delete to pospay_app
  using (public.is_company_admin(company_id) and not exists (
    select 1 from public.permission_overrides where company_id=phone_bindings.company_id
    and user_id=public.current_app_user() and permission='attendance.manage_devices' and effect='deny'));

create table if not exists public.phone_challenges (
  company_id uuid not null references public.companies(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  user_id text not null,
  challenge text not null,
  purpose text not null check (purpose in ('bind','scan')),
  expires_at timestamptz not null,
  primary key (company_id,id)
);
grant select, insert, delete on public.phone_challenges to pospay_app;
alter table public.phone_challenges enable row level security;
drop policy if exists challenge_own on public.phone_challenges;
create policy challenge_own on public.phone_challenges for all to pospay_app
  using (user_id=public.current_app_user() and public.is_member(company_id))
  with check (user_id=public.current_app_user() and public.my_staff_id(company_id) is not null);