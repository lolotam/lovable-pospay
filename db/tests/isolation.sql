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

insert into public.card_scan_requests(company_id,actor_user_id,id,fingerprint,result)
 values ('00000000-0000-0000-0000-00000000000b','user-a',gen_random_uuid(),repeat('b',64),'{}');
insert into public.card_policies(company_id,approved_by) values ('00000000-0000-0000-0000-00000000000b','user-b');
insert into public.attendance_cards(company_id,staff_id,token_hash,issued_by)
 select company_id,id,repeat('b',64),'user-b' from public.staff_members where user_id='user-b';
insert into public.service_catalog(company_id,name,price_mills) values ('00000000-0000-0000-0000-00000000000b','B service',25125);
insert into public.service_assignments(company_id,service_id,staff_id)
 select s.company_id,c.id,s.id from public.staff_members s join public.service_catalog c using(company_id) where s.user_id='user-b';
insert into public.clients(company_id,name,phone) values ('00000000-0000-0000-0000-00000000000b','B client','96500000001');
insert into public.service_sessions(company_id,service_id,staff_id,branch_id,client_id,occurred_at,service_name,price_mills)
 select s.company_id,c.id,s.id,s.branch_id,b.id,now(),c.name,c.price_mills
 from public.staff_members s join public.service_catalog c using(company_id)
 join public.clients b using(company_id) where s.user_id='user-b';
insert into public.discount_grants(company_id,role,max_percent,granted_by) values ('00000000-0000-0000-0000-00000000000b','reception',10,'seed');
insert into public.discount_grants(company_id,user_id,max_percent,granted_by) values ('00000000-0000-0000-0000-00000000000b','user-former',50,'seed');
insert into public.invitations(company_id,email,role,token_hash,expires_at,invited_by)
 values ('00000000-0000-0000-0000-00000000000b','invite-b@example.test','staff',repeat('b',64),now()+interval '1 day','user-b');
insert into public.permission_overrides(company_id,user_id,permission,effect) values
 ('00000000-0000-0000-0000-00000000000b','user-b','reports.view','allow');
select set_config('test.b_branch' , (select id::text from public.branches where name='B-1'), true);
select set_config('test.a_branch' , (select id::text from public.branches where name='A-1'), true);
insert into public.memberships (company_id, user_id, role, branch_id)
 values ('00000000-0000-0000-0000-00000000000b','user-bm','branch_manager',current_setting('test.b_branch')::uuid);
insert into public."user"(id,email,name,"emailVerified") values
 ('user-invited','invite-b@example.test','Invited',true),('user-other','other@example.test','Other',true),
 ('user-b','owner-b@example.test','Owner B',true),('user-bm','manager-b@example.test','Manager B',true);
insert into public.permission_overrides(company_id,user_id,permission,effect) values
 ('00000000-0000-0000-0000-00000000000b','user-b','reports.read','deny'),
 ('00000000-0000-0000-0000-00000000000b','user-b','sessions.record','deny');
set local role pospay_app;
select set_config('app.user_id','user-b',true);
do $$ begin
  if (select count(*) from public.company_member_directory('00000000-0000-0000-0000-00000000000b')
      where user_id in ('user-b','user-bm')) <> 2
    then raise exception 'Owner cannot read its member directory'; end if;
  if not public.report_reader('00000000-0000-0000-0000-00000000000b')
     or not public.session_writer('00000000-0000-0000-0000-00000000000b', current_setting('test.b_branch')::uuid)
    then raise exception 'Deny row removed owner report or session access'; end if;
  if not exists(select 1 from public.invitations where email='invite-b@example.test')
    then raise exception 'B cannot read its invitation'; end if;
  if not exists (
    select 1 from public.service_sessions s join public.clients c
      on c.company_id=s.company_id and c.id=s.client_id where c.name='B client'
  ) then raise exception 'B cannot read its linked client'; end if;
end $$;
do $$ begin
  begin
    insert into public.discount_grants(company_id,user_id,max_percent,granted_by)
      values ('00000000-0000-0000-0000-00000000000b','user-outsider',20,'user-b');
    raise exception 'Discount grant accepted a non-member';
  exception when insufficient_privilege then null;
  end;
end $$;
do $$ begin
  begin
    insert into public.invitations(company_id,email,role,branch_id,token_hash,expires_at,invited_by)
      values ('00000000-0000-0000-0000-00000000000b','cross@example.test','staff',current_setting('test.a_branch')::uuid,repeat('c',64),now()+interval '1 day','user-b');
    raise exception 'Invitation accepted another company branch';
  exception when foreign_key_violation then null;
  end;
end $$;
select set_config('app.user_id','user-bm',true);
do $$ begin
  if exists(select 1 from public.company_member_directory('00000000-0000-0000-0000-00000000000b'))
    then raise exception 'LEAK member directory to non-owner'; end if;
  begin
    insert into public.invitations(company_id,email,role,token_hash,expires_at,invited_by)
      values ('00000000-0000-0000-0000-00000000000b','wide@example.test','reception',repeat('d',64),now()+interval '1 day','user-bm');
    raise exception 'Branch manager invited outside the branch scope';
  exception when insufficient_privilege then null;
  end;
  insert into public.invitations(company_id,email,role,branch_id,token_hash,expires_at,invited_by)
    values ('00000000-0000-0000-0000-00000000000b','scoped@example.test','reception',current_setting('test.b_branch')::uuid,repeat('e',64),now()+interval '1 day','user-bm');
end $$;
select set_config('app.user_id','user-other',true);
do $$ begin
  begin
    perform public.accept_invitation(repeat('b',64),'invite-b@example.test');
    raise exception 'Invitation accepted by a different signed-in email';
  exception when raise_exception then
    if sqlerrm <> 'INVITE_EMAIL_MISMATCH' then raise; end if;
  end;
end $$;
select set_config('app.user_id','user-invited',true);
do $$ begin
  perform public.accept_invitation(repeat('b',64),'invite-b@example.test');
  if not exists(select 1 from public.memberships where user_id='user-invited' and role='staff')
    then raise exception 'Invited user did not become a member'; end if;
end $$;
select set_config('app.user_id','user-former',true);
do $$ begin
  if exists(select 1 from public.discount_grants) then raise exception 'LEAK discount grant to former member'; end if;
  if public.discount_cap('00000000-0000-0000-0000-00000000000b') <> 0
    then raise exception 'Former member keeps a discount cap'; end if;
end $$;
select set_config('app.user_id','user-a',true);
do $$ begin
  if exists(select 1 from public.attendance_daily('00000000-0000-0000-0000-00000000000b',null,current_date-13,current_date)) then raise exception 'LEAK foreign attendance chart'; end if;
  if exists(select 1 from public.late_leaders('00000000-0000-0000-0000-00000000000b',null,current_date-13,current_date)) then raise exception 'LEAK foreign late leaders'; end if;
  if exists(select 1 from public.session_daily('00000000-0000-0000-0000-00000000000b',null,current_date-13,current_date)) then raise exception 'LEAK foreign session chart'; end if;
  if exists(select 1 from public.platform_growth(12)) then raise exception 'LEAK platform growth'; end if;
  if exists(select 1 from public.company_member_directory('00000000-0000-0000-0000-00000000000b'))
    then raise exception 'LEAK foreign member directory'; end if;
  insert into public.branches (company_id, name)
    values ('00000000-0000-0000-0000-00000000000a', 'Owner branch default');
  if not exists (
    select 1 from public.branches where name='Owner branch default'
      and length(public.branch_qr_secret(id)) = 64
  ) then raise exception 'Branch QR secret default missing'; end if;
  if (select count(*) from public.permission_overrides where company_id='00000000-0000-0000-0000-00000000000b') <> 0
    then raise exception 'LEAK permission_overrides'; end if;
  if public.has_permission('00000000-0000-0000-0000-00000000000b','reports.view')
    then raise exception 'LEAK foreign permission'; end if;
  begin
    insert into public.permission_overrides(company_id,user_id,permission,effect)
      values ('00000000-0000-0000-0000-00000000000b','user-a','pos.access','allow');
    raise exception 'LEAK: A inserted override into B';
  exception when insufficient_privilege then null;
  end;
  if exists(select 1 from public.card_policies) then raise exception 'LEAK card policy'; end if;
  if exists(select 1 from public.invitations) then raise exception 'LEAK invitations'; end if;
  if exists(select 1 from public.attendance_cards) then raise exception 'LEAK cards'; end if;
  if exists(select 1 from public.card_scan_requests) then raise exception 'LEAK card scan receipts'; end if;
  if exists(select 1 from public.service_catalog) then raise exception 'LEAK catalog'; end if;
  if exists(select 1 from public.service_assignments) then raise exception 'LEAK assignments'; end if;
  if exists(select 1 from public.service_sessions) then raise exception 'LEAK sessions'; end if;
  if exists(select 1 from public.clients) then raise exception 'LEAK clients'; end if;
  if exists(select 1 from public.discount_grants) then raise exception 'LEAK discount_grants'; end if;
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
  if exists(select 1 from public.attendance_daily('00000000-0000-0000-0000-00000000000a',null,current_date-13,current_date)) then raise exception 'LEAK attendance chart without reports'; end if;
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
