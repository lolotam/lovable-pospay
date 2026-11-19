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