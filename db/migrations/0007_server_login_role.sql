-- Dedicated login role for the app server (no superuser, no BYPASSRLS).
-- It may only switch to pospay_app (RLS-bound) and read/write the Better Auth
-- tables. The password is set out-of-band and never committed.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'pospay_server') then
    create role pospay_server nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
  end if;
end $$;

grant pospay_app to pospay_server;
grant usage on schema public to pospay_server;

do $$
declare t text;
begin
  foreach t in array array['user','session','account','verification','twoFactor','passkey'] loop
    execute format('grant select, insert, update, delete on public.%I to pospay_server', t);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'server_auth_all') then
      execute format('create policy server_auth_all on public.%I for all to pospay_server using (true) with check (true)', t);
    end if;
  end loop;
end $$;
