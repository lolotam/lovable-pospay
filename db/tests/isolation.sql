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
insert into public.staff_members (company_id, id, branch_id, user_id, display_name)
  select company_id, gen_random_uuid(), id, case name when 'A-1' then 'user-a' else 'user-b' end, name
  from public.branches;
insert into public.attendance_records (company_id, id, staff_id, branch_id, work_date, check_in_at)
  select s.company_id, gen_random_uuid(), s.id, s.branch_id, current_date, now() from public.staff_members s;

insert into public.card_policies(company_id,approved_by) values ('00000000-0000-0000-0000-00000000000b','user-b');
insert into public.attendance_cards(company_id,staff_id,token_hash,issued_by)
 select company_id,id,repeat('b',64),'user-b' from public.staff_members where user_id='user-b';
insert into public.service_catalog(company_id,name,price_mills) values ('00000000-0000-0000-0000-00000000000b','B service',25125);
insert into public.service_assignments(company_id,service_id,staff_id)
 select s.company_id,c.id,s.id from public.staff_members s join public.service_catalog c using(company_id) where s.user_id='user-b';
insert into public.service_sessions(company_id,service_id,staff_id,branch_id,occurred_at,service_name,price_mills)
 select s.company_id,c.id,s.id,s.branch_id,now(),c.name,c.price_mills from public.staff_members s join public.service_catalog c using(company_id) where s.user_id='user-b';
select set_config('test.b_branch' , (select id::text from public.branches where name='B-1'), true);
set local role pospay_app;
select set_config('app.user_id','user-a',true);
do $$ begin
  insert into public.branches (company_id, name)
    values ('00000000-0000-0000-0000-00000000000a', 'Owner branch default');
  if not exists (
    select 1 from public.branches where name='Owner branch default'
      and length(public.branch_qr_secret(id)) = 64
  ) then raise exception 'Branch QR secret default missing'; end if;
  if exists(select 1 from public.card_policies) then raise exception 'LEAK card policy'; end if;
  if exists(select 1 from public.attendance_cards) then raise exception 'LEAK cards'; end if;
  if exists(select 1 from public.service_catalog) then raise exception 'LEAK catalog'; end if;
  if exists(select 1 from public.service_assignments) then raise exception 'LEAK assignments'; end if;
  if exists(select 1 from public.service_sessions) then raise exception 'LEAK sessions'; end if;
  if (select count(*) from public.companies where name='B') <> 0 then raise exception 'LEAK companies'; end if;
  if (select count(*) from public.branches where name='B-1') <> 0 then raise exception 'LEAK branches'; end if;
  if (select count(*) from public.memberships where user_id='user-b') <> 0 then raise exception 'LEAK memberships'; end if;
  if (select count(*) from public.staff_members where display_name='B-1') <> 0 then raise exception 'LEAK staff'; end if;
  if (select count(*) from public.attendance_records) <> 1 then raise exception 'LEAK attendance'; end if;
  if public.branch_qr_secret(current_setting('test.b_branch')::uuid) is not null
    then raise exception 'LEAK qr secret'; end if;
  begin
    insert into public.attendance_records (company_id, id, staff_id, branch_id, work_date, check_in_at)
      values ('00000000-0000-0000-0000-00000000000b', gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), current_date, now());
    raise exception 'LEAK: A inserted attendance into B';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.staff_members (company_id, branch_id, display_name)
      values ('00000000-0000-0000-0000-00000000000a', current_setting('test.b_branch')::uuid, 'Wrong branch');
    raise exception 'Staff record accepted another company branch';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.attendance_records (company_id, id, staff_id, branch_id, work_date, check_in_at, check_out_at, status)
      select company_id, gen_random_uuid(), id, current_setting('test.b_branch')::uuid, current_date, now(), now(), 'ok'
        from public.staff_members where user_id='user-a';
    raise exception 'Attendance record accepted another company branch';
  exception when foreign_key_violation then null;
  end;
  if (select count(*) from public.companies) <> 1 then raise exception 'A should see exactly its company'; end if;
  update public.branches set name='hacked' where name='B-1';
  if found then raise exception 'LEAK: A updated B branch'; end if;
end $$;
select set_config('app.user_id','',true);
do $$ begin
  if (select count(*) from public.companies) <> 0 then raise exception 'anonymous sees rows'; end if;
end $$;
reset role;
do $$ begin
  if exists (
    select 1 from pg_roles where rolname='pospay_server'
      and (rolsuper or rolcreatedb or rolcreaterole or rolinherit or rolreplication or rolbypassrls)
  ) then raise exception 'Unsafe pospay_server attributes'; end if;
end $$;
rollback;
\echo 'isolation: PASS'
