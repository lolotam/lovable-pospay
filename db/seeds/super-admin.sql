-- Run as the database owner after migrations 0004 and 0006 and email verification.
-- Adds the PosPay platform super admin. Idempotent.
do $$
declare
  verified_user_id text;
begin
  select id into strict verified_user_id
  from public."user"
  where lower(email) = lower('dr.vet.waleedtam@gmail.com') and "emailVerified" is true;

  insert into public.platform_admins (user_id)
  values (verified_user_id)
  on conflict (user_id) do nothing;
exception
  when no_data_found or too_many_rows then
    raise exception 'Expected exactly one verified Better Auth account for platform administration';
end $$;
select count(*) as super_admins from public.platform_admins;
