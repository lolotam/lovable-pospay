-- PosPay never uses the Supabase REST API: all access goes through pg + withUser() as pospay_app.
-- Remove anon/authenticated access so nothing is reachable through /rest/v1.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from anon, authenticated, public;
grant execute on function public.current_app_user(), public.is_member(uuid),
  public.has_company_role(uuid, public.company_role), public.my_staff_id(uuid),
  public.is_company_admin(uuid), public.branch_qr_secret(uuid), public.is_super_admin() to pospay_app;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated, public;
alter function public.current_app_user() set search_path = public;
