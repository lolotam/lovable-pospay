-- The REST revocation also covers pgcrypto when it is installed in public.
do $$
begin
  if exists (
    select 1 from pg_extension e join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pgcrypto' and n.nspname = 'public'
  ) then
    grant execute on function public.gen_random_bytes(integer) to pospay_app;
  end if;
end $$;

-- Preserve the separately approved LOGIN state and password.
alter role pospay_server nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
