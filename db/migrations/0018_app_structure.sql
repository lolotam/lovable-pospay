-- 016: workspace label and effective permission check (role defaults + overrides, deny wins).
alter table public.companies add column if not exists business_type text not null default 'salon';
do $$ begin
  alter table public.companies add constraint companies_business_type_chk
    check (business_type in ('salon','restaurant','laundry','other'));
exception when duplicate_object then null; end $$;

create or replace function public.role_default_permission(_role public.company_role, _permission text)
returns boolean language sql immutable as $$
  select case _role
    when 'owner' then true
    when 'branch_manager' then _permission in
      ('reports.view','attendance.correct','staff.manage','services.manage','discounts.manage')
    when 'reception' then _permission = 'pos.access'
    when 'accountant' then _permission = 'reports.view'
    when 'viewer' then _permission = 'reports.view'
    else false end $$;

create or replace function public.has_permission(_company uuid, _permission text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when public.has_company_role(_company, 'owner') then true
    when exists (select 1 from public.permission_overrides o
                 where o.company_id = _company and o.user_id = public.current_app_user()
                   and o.permission = _permission and o.effect = 'deny') then false
    else exists (select 1 from public.memberships m
                 where m.company_id = _company and m.user_id = public.current_app_user()
                   and public.role_default_permission(m.role, _permission))
      or exists (select 1 from public.permission_overrides o
                 where o.company_id = _company and o.user_id = public.current_app_user()
                   and o.permission = _permission and o.effect = 'allow'
                   and public.is_member(_company))
  end $$;

create or replace function public.platform_overview()
returns table(companies bigint, users bigint)
language sql stable security definer set search_path = public as $$
  select (select count(*) from public.companies), (select count(*) from public."user")
  where public.is_super_admin() $$;

revoke all on function public.role_default_permission(public.company_role, text) from public;
revoke all on function public.has_permission(uuid, text) from public;
revoke all on function public.platform_overview() from public;
grant execute on function public.role_default_permission(public.company_role, text) to pospay_app;
grant execute on function public.has_permission(uuid, text) to pospay_app;
grant execute on function public.platform_overview() to pospay_app;
