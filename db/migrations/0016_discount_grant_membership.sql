-- 0014 follow-up: a personal discount grant counts only while its holder is a company member.
create or replace function public.discount_cap(_company uuid) returns integer
language sql stable security definer set search_path=public as $$
 select case when public.discount_manager(_company) then 100 else coalesce((
  select max(g.max_percent) from public.discount_grants g where g.company_id=_company and public.is_member(_company) and (
   g.user_id=public.current_app_user() or g.role in (select m.role from public.memberships m where m.company_id=_company and m.user_id=public.current_app_user()))),0) end $$;
revoke all on function public.discount_cap(uuid) from public;
grant execute on function public.discount_cap(uuid) to pospay_app;
drop policy if exists discount_grants_read on public.discount_grants;
create policy discount_grants_read on public.discount_grants for select to pospay_app
 using(public.discount_manager(company_id) or (user_id=public.current_app_user() and public.is_member(company_id)));
drop policy if exists discount_grants_write on public.discount_grants;
create policy discount_grants_write on public.discount_grants for all to pospay_app
 using(public.discount_manager(company_id))
 with check(public.discount_manager(company_id) and granted_by=public.current_app_user()
  and (user_id is null or exists(select 1 from public.memberships m
   where m.company_id=discount_grants.company_id and m.user_id=discount_grants.user_id)));
