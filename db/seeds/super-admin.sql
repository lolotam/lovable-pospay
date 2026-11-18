-- Run once as the database owner AFTER migration 0004 and after this person signs up in Better Auth.
-- Adds the PosPay platform super admin. Idempotent.
insert into public.platform_admins (user_id)
select id from public."user" where lower(email) = lower('dr.vet.waleedtam@gmail.com')
on conflict (user_id) do nothing;
select count(*) as super_admins from public.platform_admins;
