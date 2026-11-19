-- 016-C1: prepared only; execution belongs to Claude Code / Waleed.
create or replace function public.company_member_directory(_company uuid)
returns table(user_id text, name text, email text, roles text[], branch_id uuid)
language sql stable security definer set search_path = public as $$
  select m.user_id, coalesce(s.display_name, u.name), u.email,
         array_agg(distinct m.role::text order by m.role::text),
         coalesce(s.branch_id, (array_agg(m.branch_id order by m.role::text)
           filter (where m.branch_id is not null))[1])
  from public.memberships m
  join public."user" u on u.id = m.user_id
  left join lateral (
    select sm.display_name, sm.branch_id
    from public.staff_members sm
    where sm.company_id = _company and sm.user_id = m.user_id
    order by sm.id limit 1
  ) s on true
  where m.company_id = _company and public.has_company_role(_company, 'owner')
  group by m.user_id, s.display_name, u.name, u.email, s.branch_id
  order by coalesce(s.display_name, u.name), m.user_id;
$$;
revoke all on function public.company_member_directory(uuid) from public;
grant execute on function public.company_member_directory(uuid) to pospay_app;

-- Owners are read-only in the permission editor, so a stale deny row must not
-- remove an owner's report or session access.
create or replace function public.report_reader(_company uuid, _branch uuid default null) returns boolean
language sql stable security definer set search_path=public as $$
 select public.has_company_role(_company,'owner')
  or ((public.has_company_role(_company,'accountant') or public.has_company_role(_company,'viewer') or exists(select 1 from memberships where company_id=_company and user_id=public.current_app_user() and role='branch_manager' and (_branch is null or branch_id is null or branch_id=_branch)))
   and not exists(select 1 from permission_overrides where company_id=_company and user_id=public.current_app_user() and permission='reports.read' and effect='deny'))
$$;
revoke all on function public.report_reader(uuid,uuid) from public;
grant execute on function public.report_reader(uuid,uuid) to pospay_app;
create or replace function public.session_writer(_company uuid, _branch uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select public.has_company_role(_company,'owner')
  or (exists(select 1 from memberships where company_id=_company and user_id=public.current_app_user() and role in ('branch_manager','reception') and (branch_id is null or branch_id=_branch))
   and not exists(select 1 from permission_overrides where company_id=_company and user_id=public.current_app_user() and permission='sessions.record' and effect='deny'))
$$;
revoke all on function public.session_writer(uuid,uuid) from public;
grant execute on function public.session_writer(uuid,uuid) to pospay_app;