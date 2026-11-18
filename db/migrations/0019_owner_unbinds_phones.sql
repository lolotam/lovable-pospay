-- Issue #11 item 3: the company owner is never affected by a permission override (D-31), so an
-- 'attendance.manage_devices' deny now blocks phone unbinding for every admin except the owner.
drop policy if exists phone_unbind on public.phone_bindings;
create policy phone_unbind on public.phone_bindings for delete to pospay_app
  using (public.is_company_admin(company_id) and (public.has_company_role(company_id, 'owner') or not exists (
    select 1 from public.permission_overrides where company_id=phone_bindings.company_id
    and user_id=public.current_app_user() and permission='attendance.manage_devices' and effect='deny')));
