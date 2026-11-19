-- C2: a current member may unbind only their own phone; managers retain the existing gate.
drop policy if exists phone_unbind on public.phone_bindings;
create policy phone_unbind on public.phone_bindings for delete to pospay_app
using (
  (user_id=public.current_app_user() and public.is_member(company_id))
  or (
    public.is_company_admin(company_id)
    and public.has_permission(company_id,'staff.manage')
    and (public.has_company_role(company_id,'owner') or not exists (
      select 1 from public.permission_overrides
      where company_id=phone_bindings.company_id and user_id=public.current_app_user()
      and permission='attendance.manage_devices' and effect='deny'
    ))
  )
);
