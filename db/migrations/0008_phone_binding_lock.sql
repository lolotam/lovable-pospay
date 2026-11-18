-- SELECT FOR UPDATE requires UPDATE privilege on at least one column.
-- Only a member's own row may be locked. The write check rejects every update.
grant update (id) on public.phone_bindings to pospay_app;

drop policy if exists phone_lock_own on public.phone_bindings;
create policy phone_lock_own on public.phone_bindings for update to pospay_app
  using (user_id = public.current_app_user() and public.is_member(company_id))
  with check (false);
