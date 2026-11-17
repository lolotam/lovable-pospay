-- Acceptance #4 (negative test): company A must not read any row of company B.
-- Run: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/tests/isolation.sql
begin;
insert into public.companies (id, name) values
  ('00000000-0000-0000-0000-00000000000a','A'),('00000000-0000-0000-0000-00000000000b','B');
insert into public.branches (company_id, name) values
  ('00000000-0000-0000-0000-00000000000a','A-1'),('00000000-0000-0000-0000-00000000000b','B-1');
insert into public.memberships (company_id, user_id, role) values
  ('00000000-0000-0000-0000-00000000000a','user-a','owner'),
  ('00000000-0000-0000-0000-00000000000b','user-b','owner');

set local role pospay_app;
select set_config('app.user_id','user-a',true);
do $$ begin
  if (select count(*) from public.companies where name='B') <> 0 then raise exception 'LEAK companies'; end if;
  if (select count(*) from public.branches where name='B-1') <> 0 then raise exception 'LEAK branches'; end if;
  if (select count(*) from public.memberships where user_id='user-b') <> 0 then raise exception 'LEAK memberships'; end if;
  if (select count(*) from public.companies) <> 1 then raise exception 'A should see exactly its company'; end if;
  update public.branches set name='hacked' where name='B-1';
  if found then raise exception 'LEAK: A updated B branch'; end if;
end $$;
select set_config('app.user_id','',true);
do $$ begin
  if (select count(*) from public.companies) <> 0 then raise exception 'anonymous sees rows'; end if;
end $$;
reset role;
rollback;
\echo 'isolation: PASS'
