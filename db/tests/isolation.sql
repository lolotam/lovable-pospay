-- Acceptance #4 (negative test): company A must not read any row of company B.
-- Run: psql "$POSPAY_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f db/tests/isolation.sql
do $$ begin
  if current_database() <> 'pospay_test' then
    raise exception 'isolation.sql runs only against the disposable pospay_test database';
  end if;
end $$;
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
insert into public.company_pages(company_id,slug,updated_by) values
 ('00000000-0000-0000-0000-00000000000b','isolation-b','user-b');
insert into public.company_assets(company_id,id,object_key,content_type,byte_size,created_by) values
 ('00000000-0000-0000-0000-00000000000b','10000000-0000-4000-8000-000000000001','companies/b/pages/image.png','image/png',8,'user-b');
select set_config('test.b_branch' , (select id::text from public.branches where name='B-1'), true);
select set_config('test.a_branch' , (select id::text from public.branches where name='A-1'), true);
select set_config('test.b_session', (select id::text from public.service_sessions where company_id='00000000-0000-0000-0000-00000000000b' limit 1), true);
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
  if exists(select 1 from public.company_pages) then raise exception 'LEAK draft to branch manager'; end if;
  if exists(select 1 from public.company_assets) then raise exception 'LEAK assets to branch manager'; end if;
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
  if exists(select 1 from public.company_pages where company_id='00000000-0000-0000-0000-00000000000b') then raise exception 'LEAK foreign page'; end if;
  update public.company_pages set slug='hacked-page' where company_id='00000000-0000-0000-0000-00000000000b';
  if found then raise exception 'LEAK foreign page update'; end if;
  if exists(select 1 from public.attendance_daily('00000000-0000-0000-0000-00000000000b',null,current_date-13,current_date)) then raise exception 'LEAK foreign attendance chart'; end if;
  if exists(select 1 from public.late_leaders('00000000-0000-0000-0000-00000000000b',null,current_date-13,current_date)) then raise exception 'LEAK foreign late leaders'; end if;
  if exists(select 1 from public.session_daily('00000000-0000-0000-0000-00000000000b',null,current_date-13,current_date)) then raise exception 'LEAK foreign session chart'; end if;
  if coalesce(current_setting('test.b_session',true),'') = '' then raise exception 'Fixture missing a company B session'; end if;
  begin
    perform public.recorded_session_replay('00000000-0000-0000-0000-00000000000b',current_setting('test.b_session')::uuid,'x');
    raise exception 'LEAK foreign session replay state';
  exception when others then
    if sqlerrm <> 'FORBIDDEN' then raise; end if;
  end;
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
  if exists(select 1 from public.company_assets) then raise exception 'LEAK foreign assets'; end if;
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
  if exists(select 1 from public.public_asset('10000000-0000-4000-8000-000000000001')) then raise exception 'LEAK unpublished asset'; end if;
  if public.public_company_page('isolation-b') is not null then raise exception 'LEAK unpublished page'; end if;
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

insert into public.companies(id,name) values
  ('19000000-0000-4000-8000-000000000001','Commission A'),
  ('19000000-0000-4000-8000-000000000002','Commission B');
insert into public.branches(company_id,id,name) values
  ('19000000-0000-4000-8000-000000000001','19000000-0000-4000-8000-000000000011','Commission A-1'),
  ('19000000-0000-4000-8000-000000000002','19000000-0000-4000-8000-000000000012','Commission B-1'),
  ('19000000-0000-4000-8000-000000000002','19000000-0000-4000-8000-000000000013','Commission B-2');
insert into public.memberships(company_id,user_id,role,branch_id) values
  ('19000000-0000-4000-8000-000000000001','user-a','owner',null),
  ('19000000-0000-4000-8000-000000000002','user-b','owner',null),
  ('19000000-0000-4000-8000-000000000002','commission-bm-1','branch_manager','19000000-0000-4000-8000-000000000012'),
  ('19000000-0000-4000-8000-000000000002','commission-bm-2','branch_manager','19000000-0000-4000-8000-000000000013'),
  ('19000000-0000-4000-8000-000000000002','commission-reception','reception','19000000-0000-4000-8000-000000000012');
insert into public.staff_members(company_id,id,branch_id,display_name) values
  ('19000000-0000-4000-8000-000000000002','19000000-0000-4000-8000-000000000021','19000000-0000-4000-8000-000000000012','Commission staff 1'),
  ('19000000-0000-4000-8000-000000000002','19000000-0000-4000-8000-000000000022','19000000-0000-4000-8000-000000000013','Commission staff 2');
insert into public.commission_plans(company_id,id,name,created_by) values
  ('19000000-0000-4000-8000-000000000002','19000000-0000-4000-8000-000000000031','B commission plan','user-b');
insert into public.commission_plan_versions(
  company_id,id,plan_id,version,effective_month,base_rate_bp,created_by
) values (
  '19000000-0000-4000-8000-000000000002','19000000-0000-4000-8000-000000000032',
  '19000000-0000-4000-8000-000000000031',1,'2027-01-01',100,'user-b'
);
insert into public.staff_commission_plans(company_id,id,staff_id,plan_id,effective_month,assigned_by) values
  ('19000000-0000-4000-8000-000000000002','19000000-0000-4000-8000-000000000033',
   '19000000-0000-4000-8000-000000000021','19000000-0000-4000-8000-000000000031','2027-01-01','user-b');

set local role pospay_app;
select set_config('app.user_id','user-a',true);
do $$ begin
  if exists(select 1 from public.commission_plans where company_id='19000000-0000-4000-8000-000000000002')
    then raise exception 'LEAK commission plans'; end if;
  if exists(select 1 from public.commission_plan_versions where company_id='19000000-0000-4000-8000-000000000002')
    then raise exception 'LEAK commission versions'; end if;
  if exists(select 1 from public.staff_commission_plans where company_id='19000000-0000-4000-8000-000000000002')
    then raise exception 'LEAK commission assignments'; end if;
  begin
    insert into public.commission_plans(company_id,name,created_by)
      values('19000000-0000-4000-8000-000000000002','Foreign plan','user-a');
    raise exception 'A inserted a commission plan into B';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.commission_plan_versions(company_id,plan_id,version,effective_month,base_rate_bp,created_by)
      values('19000000-0000-4000-8000-000000000002','19000000-0000-4000-8000-000000000031',9,'2027-01-01',100,'user-a');
    raise exception 'A inserted a commission version into B';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.staff_commission_plans(company_id,staff_id,plan_id,effective_month,assigned_by)
      values('19000000-0000-4000-8000-000000000002','19000000-0000-4000-8000-000000000021',
             '19000000-0000-4000-8000-000000000031','2027-03-01','user-a');
    raise exception 'A assigned a commission plan in B';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('app.user_id','user-b',true);
do $$ begin
  if (select count(*) from public.commission_plans) <> 1
     or (select count(*) from public.commission_plan_versions) <> 1
     or (select count(*) from public.staff_commission_plans) <> 1
    then raise exception 'Owner B cannot read its own commission rows'; end if;
end $$;
select set_config('app.user_id','commission-bm-1',true);
do $$ begin
  insert into public.staff_commission_plans(company_id,staff_id,plan_id,effective_month,assigned_by)
    values('19000000-0000-4000-8000-000000000002','19000000-0000-4000-8000-000000000021',
           '19000000-0000-4000-8000-000000000031','2027-02-01','commission-bm-1');
  begin
    insert into public.staff_commission_plans(company_id,staff_id,plan_id,effective_month,assigned_by)
      values('19000000-0000-4000-8000-000000000002','19000000-0000-4000-8000-000000000022',
             '19000000-0000-4000-8000-000000000031','2027-02-01','commission-bm-1');
    raise exception 'Branch manager assigned staff from another branch';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('app.user_id','commission-reception',true);
do $$ begin
  if exists(select 1 from public.commission_plans where company_id='19000000-0000-4000-8000-000000000002')
    then raise exception 'Reception read commission plans'; end if;
  if exists(select 1 from public.commission_plan_versions where company_id='19000000-0000-4000-8000-000000000002')
    then raise exception 'Reception read commission versions'; end if;
  if exists(select 1 from public.staff_commission_plans where company_id='19000000-0000-4000-8000-000000000002')
    then raise exception 'Reception read commission assignments'; end if;
end $$;
select set_config('app.user_id','user-b',true);
do $$ begin
  begin
    insert into public.commission_plan_versions(company_id,plan_id,version,effective_month,base_rate_bp,created_by)
      values('19000000-0000-4000-8000-000000000002','19000000-0000-4000-8000-000000000031',9,'2027-01-01',100,'commission-bm-1');
    raise exception 'Owner B spoofed created_by';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.staff_commission_plans(company_id,staff_id,plan_id,effective_month,assigned_by)
      values('19000000-0000-4000-8000-000000000002','19000000-0000-4000-8000-000000000021',
             '19000000-0000-4000-8000-000000000031','2027-03-01','commission-bm-1');
    raise exception 'Owner B spoofed assigned_by';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.commission_plans set name='Changed' where company_id='19000000-0000-4000-8000-000000000002';
    raise exception 'Commission plan update was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.commission_plan_versions set version=2 where company_id='19000000-0000-4000-8000-000000000002';
    raise exception 'Commission version update was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.staff_commission_plans set effective_month='2027-02-01' where company_id='19000000-0000-4000-8000-000000000002';
    raise exception 'Commission assignment update was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.commission_plans where company_id='19000000-0000-4000-8000-000000000002';
    raise exception 'Commission plan delete was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.commission_plan_versions where company_id='19000000-0000-4000-8000-000000000002';
    raise exception 'Commission version delete was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.staff_commission_plans where company_id='19000000-0000-4000-8000-000000000002';
    raise exception 'Commission assignment delete was allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Spec 020 isolation block (acceptance #6) ----------------------------------
-- Fixture ids 20000000-0000-4000-8000-… (never the 20000000-0000-0000-0000-… space).
insert into public.companies(id,name) values
  ('20000000-0000-4000-8000-000000000001','Session A'),
  ('20000000-0000-4000-8000-000000000002','Session B');
insert into public.branches(company_id,id,name) values
  ('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000011','Session A-1'),
  ('20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000012','Session B-1'),
  ('20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000013','Session B-2');
insert into public."user"(id,email,name,"emailVerified") values
  ('user-20a','s20a@example.test','Owner S20 A',true),
  ('user-20b','s20b@example.test','Owner S20 B',true),
  ('user-20bm1','s20bm1@example.test','Manager S20 B1',true),
  ('user-20bm2','s20bm2@example.test','Manager S20 B2',true),
  ('user-20rec','s20rec@example.test','Reception S20',true),
  ('user-20rec2','s20rec2@example.test','Reception2 S20',true),
  ('user-20staff','s20staff@example.test','Staff S20',true);
insert into public.memberships(company_id,user_id,role,branch_id) values
  ('20000000-0000-4000-8000-000000000001','user-20a','owner',null),
  ('20000000-0000-4000-8000-000000000002','user-20b','owner',null),
  ('20000000-0000-4000-8000-000000000002','user-20bm1','branch_manager','20000000-0000-4000-8000-000000000012'),
  ('20000000-0000-4000-8000-000000000002','user-20bm2','branch_manager','20000000-0000-4000-8000-000000000013'),
  ('20000000-0000-4000-8000-000000000002','user-20rec','reception','20000000-0000-4000-8000-000000000012'),
  ('20000000-0000-4000-8000-000000000002','user-20rec2','reception','20000000-0000-4000-8000-000000000012'),
  ('20000000-0000-4000-8000-000000000002','user-20staff','staff','20000000-0000-4000-8000-000000000012');
insert into public.staff_members(company_id,id,branch_id,display_name) values
  ('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000021','20000000-0000-4000-8000-000000000011','S20 A staff'),
  ('20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000022','20000000-0000-4000-8000-000000000012','S20 B1 staff 1'),
  ('20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000023','20000000-0000-4000-8000-000000000012','S20 B1 staff 2'),
  ('20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000024','20000000-0000-4000-8000-000000000013','S20 B2 staff');
insert into public.service_catalog(company_id,id,name,price_mills) values
  ('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000031','S20 A service',100000),
  ('20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000032','S20 B expensive',100000),
  ('20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000033','S20 B cheap',12500);
insert into public.service_assignments(company_id,service_id,staff_id) values
  ('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000031','20000000-0000-4000-8000-000000000021'),
  ('20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000032','20000000-0000-4000-8000-000000000022'),
  ('20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000032','20000000-0000-4000-8000-000000000023'),
  ('20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000032','20000000-0000-4000-8000-000000000024'),
  ('20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000033','20000000-0000-4000-8000-000000000022');
insert into public.clients(company_id,id,name,phone) values
  ('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000052','S20 A client','96500000011'),
  ('20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000051','S20 B client','96500000012');
insert into public.discount_grants(company_id,user_id,max_percent,granted_by)
  values ('20000000-0000-4000-8000-000000000002','user-20rec',10,'seed');
-- A real (already superseded) Company B request so a foreign caller can be
-- tested against an existing row, not a not-found miss.
insert into public.discount_approval_requests(
  company_id,branch_id,session_id,service_id,list_price_mills,requested_price_mills,
  discount_reason,requested_by,expires_at,status)
values ('20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000012',
        '20000000-0000-4000-8000-000000000053','20000000-0000-4000-8000-000000000032',
        100000,85000,'طلب قديم','user-20bm1',now()+interval '1 day','superseded');
-- Resolve the seeded id as the migration owner: a foreign caller's own RLS
-- subquery returns no rows and would mask the decision path under test.
select set_config('test.s20req_seed', id::text, true)
  from public.discount_approval_requests
  where company_id='20000000-0000-4000-8000-000000000002' and status='superseded';
insert into public.service_sessions(company_id,id,service_id,staff_id,branch_id,client_id,occurred_at,service_name,list_price_mills,price_mills,recorded_by) values
  ('20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000041','20000000-0000-4000-8000-000000000032','20000000-0000-4000-8000-000000000022','20000000-0000-4000-8000-000000000012','20000000-0000-4000-8000-000000000051',now()-interval '3 days','S20 B expensive',100000,100000,'user-20rec'),
  ('20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000050','20000000-0000-4000-8000-000000000032','20000000-0000-4000-8000-000000000022','20000000-0000-4000-8000-000000000012','20000000-0000-4000-8000-000000000051',now()-interval '40 days','S20 B expensive',100000,100000,'user-20rec'),
  ('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000042','20000000-0000-4000-8000-000000000031','20000000-0000-4000-8000-000000000021','20000000-0000-4000-8000-000000000011','20000000-0000-4000-8000-000000000052',now()-interval '3 days','S20 A service',100000,100000,'user-20a');
select set_config('test.s20b','20000000-0000-4000-8000-000000000002',true);
select set_config('test.s20b1','20000000-0000-4000-8000-000000000012',true);
select set_config('test.s20b2','20000000-0000-4000-8000-000000000013',true);
select set_config('test.s20svc1','20000000-0000-4000-8000-000000000032',true);
select set_config('test.s20svc2','20000000-0000-4000-8000-000000000033',true);
select set_config('test.s20staff1','20000000-0000-4000-8000-000000000022',true);
select set_config('test.s20staff2','20000000-0000-4000-8000-000000000023',true);
select set_config('test.s20client','20000000-0000-4000-8000-000000000051',true);
select set_config('test.s20sess_b1','20000000-0000-4000-8000-000000000041',true);
select set_config('test.s20sess_closed','20000000-0000-4000-8000-000000000050',true);
select set_config('test.s20sess_a','20000000-0000-4000-8000-000000000042',true);

set local role pospay_app;
select set_config('app.user_id','user-20a',true);
do $$ begin
  -- Company A owner reads 0 rows of every new Company B table.
  if exists(select 1 from public.service_session_edits) then raise exception 'LEAK S20 session edits'; end if;
  if exists(select 1 from public.discount_approvals) then raise exception 'LEAK S20 approvals'; end if;
  if exists(select 1 from public.discount_approval_requests) then raise exception 'LEAK S20 approval requests'; end if;
  if exists(select 1 from public.manager_pin_attempts) then raise exception 'LEAK S20 pin attempts'; end if;
  if exists(select 1 from public.closed_commission_months) then raise exception 'LEAK S20 closed months'; end if;
  -- Cross-tenant RPC refusals (acceptance #6).
  begin
    perform public.set_manager_pin('20000000-0000-4000-8000-000000000002','1234');
    raise exception 'Foreign set_manager_pin allowed';
  exception when raise_exception then
    if sqlerrm <> 'FORBIDDEN' then raise; end if;
  end;
  begin
    perform public.list_branch_approvers('20000000-0000-4000-8000-000000000002',current_setting('test.s20b1')::uuid);
    raise exception 'Foreign list_branch_approvers allowed';
  exception when raise_exception then
    if sqlerrm <> 'FORBIDDEN' then raise; end if;
  end;
  begin
    perform public.verify_manager_pin_approval('20000000-0000-4000-8000-000000000002',current_setting('test.s20b1')::uuid,
      current_setting('test.s20sess_b1')::uuid,current_setting('test.s20svc1')::uuid,100000,85000,'user-20b','1234','ua');
    raise exception 'Foreign verify_manager_pin_approval allowed';
  exception when raise_exception then
    if sqlerrm <> 'FORBIDDEN' then raise; end if;
  end;
  begin
    perform public.request_discount_approval('20000000-0000-4000-8000-000000000002',current_setting('test.s20b1')::uuid,
      current_setting('test.s20sess_b1')::uuid,current_setting('test.s20svc1')::uuid,100000,85000,'طلب');
    raise exception 'Foreign request_discount_approval allowed';
  exception when raise_exception then
    if sqlerrm <> 'FORBIDDEN' then raise; end if;
  end;
  begin
    perform public.list_pending_discount_approvals('20000000-0000-4000-8000-000000000002');
    raise exception 'Foreign list_pending_discount_approvals allowed';
  exception when raise_exception then
    if sqlerrm <> 'FORBIDDEN' then raise; end if;
  end;
  begin
    perform public.has_similar_session('20000000-0000-4000-8000-000000000002',current_setting('test.s20b1')::uuid,
      current_setting('test.s20svc1')::uuid,current_setting('test.s20staff1')::uuid,'96500000012',now(),null);
    raise exception 'Foreign has_similar_session allowed';
  exception when raise_exception then
    if sqlerrm <> 'FORBIDDEN' then raise; end if;
  end;
  begin
    perform public.list_editable_sessions('20000000-0000-4000-8000-000000000002',now()-interval '30 days',now(),10);
    raise exception 'Foreign list_editable_sessions allowed';
  exception when raise_exception then
    if sqlerrm <> 'FORBIDDEN' then raise; end if;
  end;
  begin
    perform public.month_close_status('20000000-0000-4000-8000-000000000002','2026-11-01');
    raise exception 'Foreign month_close_status allowed';
  exception when raise_exception then
    if sqlerrm <> 'FORBIDDEN' then raise; end if;
  end;
  begin
    perform public.update_recorded_session('20000000-0000-4000-8000-000000000002',current_setting('test.s20sess_b1')::uuid,
      current_setting('test.s20svc1')::uuid,current_setting('test.s20staff1')::uuid,'S20 B client',null,now(),100000,null,null,'تصحيح');
    raise exception 'Foreign update_recorded_session allowed';
  exception when raise_exception then
    if sqlerrm <> 'FORBIDDEN' then raise; end if;
  end;
  begin
    perform public.consume_discount_approval('20000000-0000-4000-8000-000000000002',gen_random_uuid());
    raise exception 'Foreign consume_discount_approval allowed';
  exception when raise_exception then
    if sqlerrm <> 'FORBIDDEN' then raise; end if;
  end;
  begin
    perform public.decide_discount_approval('20000000-0000-4000-8000-000000000002',
      current_setting('test.s20req_seed')::uuid, true);
    raise exception 'Foreign decide_discount_approval allowed';
  exception when raise_exception then
    if sqlerrm <> 'FORBIDDEN' then raise; end if;
  end;
  begin
    if public.has_manager_pin('20000000-0000-4000-8000-000000000002') then
      raise exception 'Foreign has_manager_pin returned true';
    end if;
    raise exception 'Foreign has_manager_pin probe allowed';
  exception when raise_exception then
    if sqlerrm <> 'FORBIDDEN' then raise; end if;
  end;
  begin
    insert into public.closed_commission_months(company_id,period_month,closed_by)
      values ('20000000-0000-4000-8000-000000000002','2026-10-01','user-20a');
    raise exception 'A closed a month in B';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('app.user_id','user-20b',true);
do $$ begin
  if public.month_close_status('20000000-0000-4000-8000-000000000002','2026-11-01') <= 0
    then raise exception 'month_close_status wrong for an open month'; end if;
  insert into public.closed_commission_months(company_id,period_month,closed_by,note)
    values ('20000000-0000-4000-8000-000000000002','2026-10-01','user-20b','إقفال تجريبي');
  if (select count(*) from public.closed_commission_months) <> 1
    then raise exception 'Owner cannot read its closed months'; end if;
  begin
    update public.closed_commission_months set note='hacked';
    raise exception 'closed_commission_months update was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.closed_commission_months;
    raise exception 'closed_commission_months delete was allowed';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('app.user_id','user-20bm1',true);
do $$ declare v_count int;
begin
  perform public.set_manager_pin('20000000-0000-4000-8000-000000000002','2468');
  if not public.has_manager_pin('20000000-0000-4000-8000-000000000002')
    then raise exception 'Manager PIN was not stored'; end if;
  begin
    insert into public.closed_commission_months(company_id,period_month,closed_by)
      values ('20000000-0000-4000-8000-000000000002','2026-09-01','user-20bm1');
    raise exception 'Branch manager closed a month';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.month_close_status('20000000-0000-4000-8000-000000000002','2026-11-01');
    raise exception 'Branch manager called month_close_status';
  exception when raise_exception then
    if sqlerrm <> 'FORBIDDEN' then raise; end if;
  end;
  select count(*) into v_count from public.list_branch_approvers('20000000-0000-4000-8000-000000000002',current_setting('test.s20b1')::uuid);
  if v_count <> 1 then raise exception 'list_branch_approvers should list only the pin holder'; end if;
  if not exists(select 1 from public.list_branch_approvers('20000000-0000-4000-8000-000000000002',current_setting('test.s20b1')::uuid)
    where user_id='user-20bm1') then raise exception 'PIN-holding manager missing from approvers'; end if;
  begin
    update public.service_sessions set price_mills=1;
    raise exception 'pospay_app updated service_sessions';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.service_sessions;
    raise exception 'pospay_app deleted service_sessions';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('app.user_id','user-20rec',true);
do $$ declare v_status text; v_approval uuid; v_at timestamptz; v_count int;
begin
  -- Duplicate probe (Rule C1): no similar session besides itself.
  if public.has_similar_session('20000000-0000-4000-8000-000000000002',current_setting('test.s20b1')::uuid,
      current_setting('test.s20svc1')::uuid,current_setting('test.s20staff1')::uuid,'96500000012',
      (select occurred_at from public.service_sessions where company_id='20000000-0000-4000-8000-000000000002' and id=current_setting('test.s20sess_b1')::uuid),
      current_setting('test.s20sess_b1')::uuid)
    then raise exception 'has_similar_session matched a non-duplicate'; end if;
  -- Spoofed approved_by with an over-limit price is refused.
  begin
    insert into public.service_sessions(company_id,id,service_id,staff_id,branch_id,client_id,occurred_at,service_name,list_price_mills,price_mills,discount_reason,recorded_by,approved_by,approved_at,approval_id)
      values ('20000000-0000-4000-8000-000000000002',gen_random_uuid(),current_setting('test.s20svc1')::uuid,current_setting('test.s20staff1')::uuid,current_setting('test.s20b1')::uuid,current_setting('test.s20client')::uuid,now(),'S20 B expensive',100000,85000,'عرض','user-20rec','user-20bm1',now(),gen_random_uuid());
    raise exception 'Spoofed over-limit approved_by accepted';
  exception when insufficient_privilege then null;
  end;
  -- Spoofed approval on a within-cap price is refused too.
  begin
    insert into public.service_sessions(company_id,id,service_id,staff_id,branch_id,client_id,occurred_at,service_name,list_price_mills,price_mills,discount_reason,recorded_by,approved_by,approved_at,approval_id)
      values ('20000000-0000-4000-8000-000000000002',gen_random_uuid(),current_setting('test.s20svc1')::uuid,current_setting('test.s20staff1')::uuid,current_setting('test.s20b1')::uuid,current_setting('test.s20client')::uuid,now(),'S20 B expensive',100000,90000,'عرض','user-20rec','user-20bm1',now(),gen_random_uuid());
    raise exception 'Spoofed within-cap approved_by accepted';
  exception when insufficient_privilege then null;
  end;
  -- Q3 surcharge without reason is refused; with reason it saves.
  begin
    insert into public.service_sessions(company_id,id,service_id,staff_id,branch_id,client_id,occurred_at,service_name,list_price_mills,price_mills,recorded_by)
      values ('20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000048',current_setting('test.s20svc2')::uuid,current_setting('test.s20staff1')::uuid,current_setting('test.s20b1')::uuid,current_setting('test.s20client')::uuid,now(),'S20 B cheap',12500,15000,'user-20rec');
    raise exception 'Surcharge without reason accepted';
  exception when insufficient_privilege then null;
  end;
  insert into public.service_sessions(company_id,id,service_id,staff_id,branch_id,client_id,occurred_at,service_name,list_price_mills,price_mills,discount_reason,recorded_by)
    values ('20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000048',current_setting('test.s20svc2')::uuid,current_setting('test.s20staff1')::uuid,current_setting('test.s20b1')::uuid,current_setting('test.s20client')::uuid,now(),'S20 B cheap',12500,15000,'شعر طويل','user-20rec');
  -- A second session for the same minute/client/service/staff: the DB allows
  -- it (the duplicate warning is an app-level confirm), and detection finds it.
  insert into public.service_sessions(company_id,id,service_id,staff_id,branch_id,client_id,occurred_at,service_name,list_price_mills,price_mills,discount_reason,recorded_by)
    values ('20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000049',current_setting('test.s20svc2')::uuid,current_setting('test.s20staff1')::uuid,current_setting('test.s20b1')::uuid,current_setting('test.s20client')::uuid,now(),'S20 B cheap',12500,12500,null,'user-20rec');
  if not public.has_similar_session('20000000-0000-4000-8000-000000000002',current_setting('test.s20b1')::uuid,
      current_setting('test.s20svc2')::uuid,current_setting('test.s20staff1')::uuid,'96500000012',now(),
      '20000000-0000-4000-8000-000000000049'::uuid)
    then raise exception 'Duplicate session was not detected'; end if;
  -- Wrong PIN: exactly one invalid row carrying no approval id, and no new
  -- approval row (regression: the invalid path once fell through and issued one).
  select count(*) into v_count from public.discount_approvals
    where company_id = '20000000-0000-4000-8000-000000000002';
  if (select count(*) <> 1
           or bool_or(status is distinct from 'invalid')
           or bool_or(approval_id is not null)
      from public.verify_manager_pin_approval('20000000-0000-4000-8000-000000000002',current_setting('test.s20b1')::uuid,
        current_setting('test.s20sess_b1')::uuid,current_setting('test.s20svc1')::uuid,100000,85000,'user-20bm1','0000','test-agent'))
    then raise exception 'Wrong PIN must return exactly one invalid approval-free row'; end if;
  if (select count(*) from public.discount_approvals
      where company_id = '20000000-0000-4000-8000-000000000002') <> v_count
    then raise exception 'Wrong PIN created a discount approval'; end if;
  -- Cross-branch approver is refused.
  begin
    perform public.verify_manager_pin_approval('20000000-0000-4000-8000-000000000002',current_setting('test.s20b1')::uuid,
      current_setting('test.s20sess_b1')::uuid,current_setting('test.s20svc1')::uuid,100000,85000,'user-20bm2','2468','test-agent');
    raise exception 'Cross-branch approver allowed';
  exception when raise_exception then
    if sqlerrm <> 'APPROVER_NOT_ALLOWED' then raise; end if;
  end;
  -- An approver without a PIN is refused.
  begin
    perform public.verify_manager_pin_approval('20000000-0000-4000-8000-000000000002',current_setting('test.s20b1')::uuid,
      current_setting('test.s20sess_b1')::uuid,current_setting('test.s20svc1')::uuid,100000,85000,'user-20b','2468','test-agent');
    raise exception 'Approver without PIN allowed';
  exception when raise_exception then
    if sqlerrm <> 'APPROVER_NOT_ALLOWED' then raise; end if;
  end;
  -- Correct PIN issues a single-use approval bound to the saved session.
  select status, approval_id into v_status, v_approval
    from public.verify_manager_pin_approval('20000000-0000-4000-8000-000000000002',current_setting('test.s20b1')::uuid,
      '20000000-0000-4000-8000-000000000043'::uuid,current_setting('test.s20svc1')::uuid,100000,85000,'user-20bm1','2468','test-agent');
  if v_status <> 'approved' or v_approval is null
    then raise exception 'Correct PIN did not approve'; end if;
  select a.created_at into v_at from public.discount_approvals a
    where a.company_id='20000000-0000-4000-8000-000000000002' and a.id=v_approval;
  insert into public.service_sessions(company_id,id,service_id,staff_id,branch_id,client_id,occurred_at,service_name,list_price_mills,price_mills,discount_reason,recorded_by,approved_by,approved_at,approval_id)
    values ('20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000043',current_setting('test.s20svc1')::uuid,current_setting('test.s20staff1')::uuid,current_setting('test.s20b1')::uuid,current_setting('test.s20client')::uuid,now(),'S20 B expensive',100000,85000,'عرض خاص','user-20rec','user-20bm1',v_at,v_approval);
  perform public.consume_discount_approval('20000000-0000-4000-8000-000000000002',v_approval);
  -- A second row reusing the consumed approval is refused.
  begin
    insert into public.service_sessions(company_id,id,service_id,staff_id,branch_id,client_id,occurred_at,service_name,list_price_mills,price_mills,discount_reason,recorded_by,approved_by,approved_at,approval_id)
      values ('20000000-0000-4000-8000-000000000002',gen_random_uuid(),current_setting('test.s20svc1')::uuid,current_setting('test.s20staff1')::uuid,current_setting('test.s20b1')::uuid,current_setting('test.s20client')::uuid,now(),'S20 B expensive',100000,85000,'عرض','user-20rec','user-20bm1',v_at,v_approval);
    raise exception 'Consumed approval reused';
  exception when insufficient_privilege then null;
  end;
  -- Approval for one service is refused on an insert for another service.
  select status, approval_id into v_status, v_approval
    from public.verify_manager_pin_approval('20000000-0000-4000-8000-000000000002',current_setting('test.s20b1')::uuid,
      '20000000-0000-4000-8000-000000000046'::uuid,current_setting('test.s20svc1')::uuid,100000,85000,'user-20bm1','2468','test-agent');
  begin
    insert into public.service_sessions(company_id,id,service_id,staff_id,branch_id,client_id,occurred_at,service_name,list_price_mills,price_mills,discount_reason,recorded_by,approved_by,approved_at,approval_id)
      values ('20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000046',current_setting('test.s20svc2')::uuid,current_setting('test.s20staff1')::uuid,current_setting('test.s20b1')::uuid,current_setting('test.s20client')::uuid,now(),'S20 B cheap',12500,10000,'عرض','user-20rec','user-20bm1',v_at,v_approval);
    raise exception 'Approval replayed for another service';
  exception when insufficient_privilege then null;
  end;
  -- Reception sees no pending approvals (not an approver) and requests remotely.
  select count(*) into v_count from public.list_pending_discount_approvals('20000000-0000-4000-8000-000000000002');
  if v_count <> 0 then raise exception 'Reception saw pending approvals'; end if;
  perform set_config('test.s20req1',public.request_discount_approval('20000000-0000-4000-8000-000000000002',current_setting('test.s20b1')::uuid,
    '20000000-0000-4000-8000-000000000047'::uuid,current_setting('test.s20svc1')::uuid,100000,80000,'طلب خصم')::text,true);
end $$;

select set_config('app.user_id','user-20bm2',true);
do $$ begin
  -- Branch 2 manager cannot read Branch 1 requests or PIN attempts.
  if exists(select 1 from public.discount_approval_requests) then raise exception 'LEAK cross-branch approval requests'; end if;
  if exists(select 1 from public.manager_pin_attempts) then raise exception 'LEAK cross-branch pin attempts'; end if;
  begin
    perform public.decide_discount_approval('20000000-0000-4000-8000-000000000002',current_setting('test.s20req1')::uuid,true);
    raise exception 'Cross-branch decide allowed';
  exception when raise_exception then
    if sqlerrm <> 'APPROVER_NOT_ALLOWED' then raise; end if;
  end;
  begin
    perform public.verify_manager_pin_approval('20000000-0000-4000-8000-000000000002',current_setting('test.s20b1')::uuid,
      current_setting('test.s20sess_b1')::uuid,current_setting('test.s20svc1')::uuid,100000,85000,'user-20bm2','2468','ua');
    raise exception 'Cross-branch PIN verification allowed';
  exception when raise_exception then
    if sqlerrm <> 'FORBIDDEN' then raise; end if;
  end;
  begin
    perform public.update_recorded_session('20000000-0000-4000-8000-000000000002',current_setting('test.s20sess_b1')::uuid,
      current_setting('test.s20svc1')::uuid,current_setting('test.s20staff1')::uuid,'S20 B client',null,now(),100000,null,null,'تصحيح');
    raise exception 'Cross-branch session edit allowed';
  exception when raise_exception then
    if sqlerrm <> 'FORBIDDEN' then raise; end if;
  end;
  if exists(select 1 from public.list_editable_sessions('20000000-0000-4000-8000-000000000002',now()-interval '30 days',now(),10))
    then raise exception 'Branch 2 manager listed Branch 1 sessions'; end if;
  if exists(select 1 from public.list_pending_discount_approvals('20000000-0000-4000-8000-000000000002'))
    then raise exception 'Branch 2 manager saw Branch 1 requests'; end if;
end $$;

select set_config('app.user_id','user-20rec2',true);
do $$ begin
  -- A second receptionist reads only her own requests: none.
  if exists(select 1 from public.discount_approval_requests) then raise exception 'LEAK other receptionist request'; end if;
  if exists(select 1 from public.manager_pin_attempts) then raise exception 'Reception read pin attempts'; end if;
end $$;

select set_config('app.user_id','user-20bm1',true);
do $$ declare v_count int;
begin
  select count(*) into v_count from public.manager_pin_attempts;
  if v_count < 1 then raise exception 'Manager cannot read failed PIN attempts'; end if;
  if not exists(select 1 from public.manager_pin_attempts where approver_user_id='user-20bm1' and requested_by='user-20rec' and user_agent='test-agent')
    then raise exception 'PIN attempt row missing requester or agent'; end if;
  select count(*) into v_count from public.list_pending_discount_approvals('20000000-0000-4000-8000-000000000002');
  if v_count <> 1 then raise exception 'Approver pending list wrong'; end if;
  perform public.decide_discount_approval('20000000-0000-4000-8000-000000000002',current_setting('test.s20req1')::uuid,true);
  begin
    perform public.decide_discount_approval('20000000-0000-4000-8000-000000000002',current_setting('test.s20req1')::uuid,true);
    raise exception 'Deciding a decided request allowed';
  exception when raise_exception then
    if sqlerrm <> 'APPROVAL_REQUEST_CLOSED' then raise; end if;
  end;
end $$;

select set_config('app.user_id','user-20rec',true);
do $$ declare v_approval uuid; v_at timestamptz; v_count int;
begin
  if not exists(select 1 from public.discount_approval_requests
      where id=current_setting('test.s20req1')::uuid and status='approved' and decided_by='user-20bm1')
    then raise exception 'Remote request was not approved'; end if;
  select a.id, a.created_at into v_approval, v_at from public.discount_approvals a
    where a.company_id='20000000-0000-4000-8000-000000000002' and a.request_id=current_setting('test.s20req1')::uuid;
  if v_approval is null then raise exception 'Remote approval row missing'; end if;
  insert into public.service_sessions(company_id,id,service_id,staff_id,branch_id,client_id,occurred_at,service_name,list_price_mills,price_mills,discount_reason,recorded_by,approved_by,approved_at,approval_id)
    values ('20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000047',current_setting('test.s20svc1')::uuid,current_setting('test.s20staff1')::uuid,current_setting('test.s20b1')::uuid,current_setting('test.s20client')::uuid,now(),'S20 B expensive',100000,80000,'طلب خصم','user-20rec','user-20bm1',v_at,v_approval);
  perform public.consume_discount_approval('20000000-0000-4000-8000-000000000002',v_approval);
  -- A rejected remote path cannot save.
  perform set_config('test.s20req2',public.request_discount_approval('20000000-0000-4000-8000-000000000002',current_setting('test.s20b1')::uuid,
    current_setting('test.s20sess_b1')::uuid,current_setting('test.s20svc1')::uuid,100000,80000,'طلب خصم')::text,true);
  select count(*) into v_count from public.discount_approval_requests;
  if v_count <> 2 then raise exception 'Reception request list wrong'; end if;
end $$;

select set_config('app.user_id','user-20bm1',true);
do $$ begin
  perform public.decide_discount_approval('20000000-0000-4000-8000-000000000002',current_setting('test.s20req2')::uuid,false);
  if exists(select 1 from public.discount_approval_requests
      where id=current_setting('test.s20req2')::uuid and status<>'rejected')
    then raise exception 'Reject did not record'; end if;
end $$;

select set_config('app.user_id','user-20rec',true);
do $$ begin
  -- The first pending request for this session; a second one supersedes it.
  perform set_config('test.s20req3',public.request_discount_approval('20000000-0000-4000-8000-000000000002',current_setting('test.s20b1')::uuid,
    current_setting('test.s20sess_b1')::uuid,current_setting('test.s20svc1')::uuid,100000,80000,'طلب خصم')::text,true);
  perform set_config('test.s20req4',public.request_discount_approval('20000000-0000-4000-8000-000000000002',current_setting('test.s20b1')::uuid,
    current_setting('test.s20sess_b1')::uuid,current_setting('test.s20svc1')::uuid,100000,80000,'طلب خصم')::text,true);
end $$;
reset role;
update public.discount_approval_requests
  set expires_at = now() - interval '1 minute'
  where company_id='20000000-0000-4000-8000-000000000002' and id=current_setting('test.s20req4')::uuid;
set local role pospay_app;
select set_config('app.user_id','user-20bm1',true);
do $$ begin
  begin
    perform public.decide_discount_approval('20000000-0000-4000-8000-000000000002',current_setting('test.s20req4')::uuid,true);
    raise exception 'Deciding an expired request allowed';
  exception when raise_exception then
    if sqlerrm <> 'APPROVAL_REQUEST_CLOSED' then raise; end if;
  end;
  if not exists(select 1 from public.discount_approval_requests
      where id=current_setting('test.s20req3')::uuid and status='superseded')
    then raise exception 'Older pending request was not superseded'; end if;
end $$;

select set_config('app.user_id','user-20rec',true);
do $$ begin
  -- Recording into the closed month (October) is refused.
  begin
    insert into public.service_sessions(company_id,id,service_id,staff_id,branch_id,client_id,occurred_at,service_name,list_price_mills,price_mills,recorded_by)
      values ('20000000-0000-4000-8000-000000000002',gen_random_uuid(),current_setting('test.s20svc1')::uuid,current_setting('test.s20staff1')::uuid,current_setting('test.s20b1')::uuid,current_setting('test.s20client')::uuid,now()-interval '40 days','S20 B expensive',100000,100000,'user-20rec');
    raise exception 'Recording into a closed month allowed';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('app.user_id','user-20bm1',true);
do $$ declare v_count int;
begin
  begin
    perform public.update_recorded_session('20000000-0000-4000-8000-000000000002',current_setting('test.s20sess_closed')::uuid,
      current_setting('test.s20svc1')::uuid,current_setting('test.s20staff1')::uuid,'S20 B client',null,now()-interval '40 days',100000,null,null,'تصحيح');
    raise exception 'Editing a closed-month session allowed';
  exception when raise_exception then
    if sqlerrm <> 'PERIOD_CLOSED' then raise; end if;
  end;
  begin
    perform public.update_recorded_session('20000000-0000-4000-8000-000000000002',current_setting('test.s20sess_b1')::uuid,
      current_setting('test.s20svc1')::uuid,current_setting('test.s20staff1')::uuid,'S20 B client',null,now()-interval '40 days',100000,null,null,'تصحيح');
    raise exception 'Moving a session into a closed month allowed';
  exception when raise_exception then
    if sqlerrm <> 'PERIOD_CLOSED' then raise; end if;
  end;
  select count(*) into v_count from public.service_session_edits;
  if v_count <> 0 then raise exception 'Refused edits wrote history'; end if;
end $$;

select set_config('app.user_id','user-20b',true);
do $$ begin
  begin
    perform public.update_recorded_session('20000000-0000-4000-8000-000000000002',current_setting('test.s20sess_closed')::uuid,
      current_setting('test.s20svc1')::uuid,current_setting('test.s20staff1')::uuid,'S20 B client',null,now()-interval '40 days',100000,null,null,'تصحيح');
    raise exception 'Owner edited a closed-month session';
  exception when raise_exception then
    if sqlerrm <> 'PERIOD_CLOSED' then raise; end if;
  end;
  -- Owner grants sessions.edit: a staff-only member must stay powerless,
  -- reception (app/pos role) becomes an editor.
  insert into public.permission_overrides(company_id,user_id,permission,effect) values
    ('20000000-0000-4000-8000-000000000002','user-20staff','sessions.edit','allow'),
    ('20000000-0000-4000-8000-000000000002','user-20rec','sessions.edit','allow');
end $$;

select set_config('app.user_id','user-20staff',true);
do $$ begin
  if public.session_editor('20000000-0000-4000-8000-000000000002',current_setting('test.s20b1')::uuid)
    then raise exception 'Stray allow row made a staff member an editor'; end if;
  begin
    perform public.update_recorded_session('20000000-0000-4000-8000-000000000002',current_setting('test.s20sess_b1')::uuid,
      current_setting('test.s20svc1')::uuid,current_setting('test.s20staff1')::uuid,'S20 B client',null,now(),100000,null,null,'تصحيح');
    raise exception 'Staff-only member edited a session';
  exception when raise_exception then
    if sqlerrm <> 'FORBIDDEN' then raise; end if;
  end;
  if exists(select 1 from public.service_session_edits)
    then raise exception 'Staff-only member read session edits'; end if;
end $$;

select set_config('app.user_id','user-20rec',true);
do $$ declare v_count int;
begin
  -- Granted reception edits an open-month session in its branch.
  perform public.update_recorded_session('20000000-0000-4000-8000-000000000002',current_setting('test.s20sess_b1')::uuid,
    current_setting('test.s20svc1')::uuid,current_setting('test.s20staff2')::uuid,'S20 B client',null,
    now()-interval '3 days',100000,null,null,'خطأ في الاختيار');
  begin
    perform public.update_recorded_session('20000000-0000-4000-8000-000000000002',current_setting('test.s20sess_b1')::uuid,
      current_setting('test.s20svc1')::uuid,current_setting('test.s20staff1')::uuid,'اسم مختلف',null,
      now()-interval '3 days',100000,null,null,'تصحيح اسم');
    raise exception 'Name change without phone allowed';
  exception when raise_exception then
    if sqlerrm <> 'CLIENT_PHONE_REQUIRED' then raise; end if;
  end;
  perform public.update_recorded_session('20000000-0000-4000-8000-000000000002',current_setting('test.s20sess_b1')::uuid,
    current_setting('test.s20svc1')::uuid,current_setting('test.s20staff1')::uuid,'S20 B client renamed','96500000099',
    now()-interval '3 days',100000,null,null,'تصحيح اسم');
  select count(*) into v_count from public.service_session_edits;
  if v_count <> 2 then raise exception 'Edit history rows wrong'; end if;
  -- Masked phone only, and can_edit flags, through the list function.
  if not exists(select 1 from public.list_editable_sessions('20000000-0000-4000-8000-000000000002',now()-interval '30 days',now(),10)
    where client_phone_last3='012' and can_edit and not month_closed)
    then raise exception 'Editable session list wrong'; end if;
end $$;

select set_config('app.user_id','user-20bm1',true);
do $$ declare v_count int;
begin
  select count(*) into v_count from public.service_session_edits;
  if v_count <> 2 then raise exception 'Manager edit history rows wrong'; end if;
  if not exists(select 1 from public.audit_log where action='session.edited')
    then raise exception 'session.edited audit missing'; end if;
  -- The approval-free edit must audit approvalKept=false, not null.
  if not exists(select 1 from public.audit_log
      where action='session.edited' and details->>'editReason'='خطأ في الاختيار'
        and details->>'approvalKept'='false')
    then raise exception 'Audit approvalKept wrong for an approval-free edit'; end if;
  select count(*) into v_count from public.clients where name='S20 B client renamed';
  if v_count <> 1 then raise exception 'Client rename did not persist'; end if;
end $$;

-- pospay_app grant-level denials on the new tables (any persona).
select set_config('app.user_id','user-20b',true);
do $$ begin
  begin perform 1 from public.manager_pins; raise exception 'pospay_app read manager_pins'; exception when insufficient_privilege then null; end;
  begin insert into public.manager_pins(company_id,user_id,pin_hash) values ('20000000-0000-4000-8000-000000000002','x','h'); raise exception 'pospay_app wrote manager_pins'; exception when insufficient_privilege then null; end;
  begin update public.manager_pins set pin_hash='x'; raise exception 'pospay_app updated manager_pins'; exception when insufficient_privilege then null; end;
  begin delete from public.manager_pins; raise exception 'pospay_app deleted manager_pins'; exception when insufficient_privilege then null; end;
  begin insert into public.manager_pin_attempts(company_id,branch_id,session_id,approver_user_id,requested_by) values ('20000000-0000-4000-8000-000000000002',current_setting('test.s20b1')::uuid,current_setting('test.s20sess_b1')::uuid,'x','y'); raise exception 'pospay_app wrote manager_pin_attempts'; exception when insufficient_privilege then null; end;
  begin update public.manager_pin_attempts set user_agent='x'; raise exception 'pospay_app updated manager_pin_attempts'; exception when insufficient_privilege then null; end;
  begin delete from public.manager_pin_attempts; raise exception 'pospay_app deleted manager_pin_attempts'; exception when insufficient_privilege then null; end;
  begin insert into public.discount_approvals(company_id,branch_id,session_id,service_id,list_price_mills,approved_price_mills,approver_user_id,requested_by,expires_at,source) values ('20000000-0000-4000-8000-000000000002',current_setting('test.s20b1')::uuid,current_setting('test.s20sess_b1')::uuid,current_setting('test.s20svc1')::uuid,100000,85000,'x','y',now()+interval '5 minutes','pin'); raise exception 'pospay_app wrote discount_approvals'; exception when insufficient_privilege then null; end;
  begin update public.discount_approvals set consumed_at=now(); raise exception 'pospay_app updated discount_approvals'; exception when insufficient_privilege then null; end;
  begin delete from public.discount_approvals; raise exception 'pospay_app deleted discount_approvals'; exception when insufficient_privilege then null; end;
  begin insert into public.discount_approval_requests(company_id,branch_id,session_id,service_id,list_price_mills,requested_price_mills,discount_reason,requested_by,expires_at) values ('20000000-0000-4000-8000-000000000002',current_setting('test.s20b1')::uuid,current_setting('test.s20sess_b1')::uuid,current_setting('test.s20svc1')::uuid,100000,80000,'x','y',now()+interval '5 minutes'); raise exception 'pospay_app wrote discount_approval_requests'; exception when insufficient_privilege then null; end;
  begin update public.discount_approval_requests set status='approved'; raise exception 'pospay_app updated discount_approval_requests'; exception when insufficient_privilege then null; end;
  begin delete from public.discount_approval_requests; raise exception 'pospay_app deleted discount_approval_requests'; exception when insufficient_privilege then null; end;
  begin insert into public.service_session_edits(company_id,session_id,edited_by,edit_reason,before_snapshot,after_snapshot) values ('20000000-0000-4000-8000-000000000002',current_setting('test.s20sess_b1')::uuid,'x','y','{}','{}'); raise exception 'pospay_app wrote service_session_edits'; exception when insufficient_privilege then null; end;
  begin update public.service_session_edits set edit_reason='x'; raise exception 'pospay_app updated service_session_edits'; exception when insufficient_privilege then null; end;
  begin delete from public.service_session_edits; raise exception 'pospay_app deleted service_session_edits'; exception when insufficient_privilege then null; end;
  begin delete from public.closed_commission_months; raise exception 'pospay_app deleted closed_commission_months'; exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Spec 021 isolation block (acceptance #32) ----------------------------------
-- Fixture ids 21000000-0000-4000-8000-….
insert into public.companies(id,name) values
  ('21000000-0000-4000-8000-000000000001','Commission2 A'),
  ('21000000-0000-4000-8000-000000000002','Commission2 B');
insert into public.branches(company_id,id,name) values
  ('21000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000011','Commission2 A-1'),
  ('21000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000012','Commission2 B-1'),
  ('21000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000013','Commission2 B-2');
insert into public."user"(id,email,name,"emailVerified") values
  ('user-21a','s21a@example.test','Owner S21 A',true),
  ('user-21b','s21b@example.test','Owner S21 B',true),
  ('user-21bm1','s21bm1@example.test','Manager S21 B1',true),
  ('user-21bm2','s21bm2@example.test','Manager S21 B2',true),
  ('user-21rec','s21rec@example.test','Reception S21',true);
insert into public.memberships(company_id,user_id,role,branch_id) values
  ('21000000-0000-4000-8000-000000000001','user-21a','owner',null),
  ('21000000-0000-4000-8000-000000000002','user-21b','owner',null),
  ('21000000-0000-4000-8000-000000000002','user-21bm1','branch_manager','21000000-0000-4000-8000-000000000012'),
  ('21000000-0000-4000-8000-000000000002','user-21bm2','branch_manager','21000000-0000-4000-8000-000000000013'),
  ('21000000-0000-4000-8000-000000000002','user-21rec','reception','21000000-0000-4000-8000-000000000012');
insert into public.staff_members(company_id,id,branch_id,display_name) values
  ('21000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000023','21000000-0000-4000-8000-000000000011','S21 A staff'),
  ('21000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000021','21000000-0000-4000-8000-000000000012','S21 B1 staff'),
  ('21000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000022','21000000-0000-4000-8000-000000000013','S21 B2 staff');
insert into public.service_catalog(company_id,id,name,price_mills) values
  ('21000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000031','S21 A service',100000),
  ('21000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000032','S21 B service 1',100000),
  ('21000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000033','S21 B service 2',50000);
insert into public.commission_plans(company_id,id,name,created_by) values
  ('21000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000041','S21 B plan','user-21b');
-- Legacy 0024 single-tier version with an explicit past created_at: simulates
-- a version committed in an earlier transaction (tier insert must be refused).
-- tier_accumulator carries the value 0026 backfilled into legacy rows.
insert into public.commission_plan_versions(
  company_id,id,plan_id,version,effective_month,tier_mode,tier_accumulator,tier_rate_bp,tier_threshold_mills,created_by,created_at
) values (
  '21000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000042',
  '21000000-0000-4000-8000-000000000041',1,'2027-01-01','all_after','sales_amount',500,1000000,'user-21b',now()-interval '1 hour'
);

set local role pospay_app;
select set_config('app.user_id','user-21a',true);
do $$ begin
  if exists(select 1 from public.commission_plan_tiers) then raise exception 'LEAK commission tiers'; end if;
  if exists(select 1 from public.service_commission_overrides) then raise exception 'LEAK commission overrides'; end if;
  if exists(select 1 from public.staff_salaries) then raise exception 'LEAK staff salaries'; end if;
  begin
    insert into public.commission_plan_tiers(company_id,version_id,tier_order,rate_bp,threshold_mills)
      values ('21000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000042',2,600,2000000);
    raise exception 'A inserted a tier into B';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.service_commission_overrides(company_id,service_id,override_kind,rate_bp,created_by)
      values ('21000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000032','rate_bp',1500,'user-21a');
    raise exception 'A inserted an override into B';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.staff_salaries(company_id,staff_id,salary_mills,effective_date,recorded_by)
      values ('21000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000021',450000,'2027-01-01','user-21a');
    raise exception 'A inserted a salary into B';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('app.user_id','user-21b',true);
do $$ begin
  -- (The 0026 backfill of real 0024 rows runs at migration time; resolution of
  -- a backfilled legacy version is covered by the Phase 2B integration test.
  -- Here the fixture version only feeds the tier-insert refusals below.)
  -- A tier for the committed (earlier transaction) version is refused.
  begin
    insert into public.commission_plan_tiers(company_id,version_id,tier_order,rate_bp,threshold_mills)
      values ('21000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000042',2,600,2000000);
    raise exception 'Tier added to a committed version';
  exception when insufficient_privilege then null;
  end;
  -- Tiers for a version created in this transaction are accepted.
  insert into public.commission_plan_versions(company_id,id,plan_id,version,effective_month,base_rate_bp,created_by)
    values ('21000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000043',
            '21000000-0000-4000-8000-000000000041',2,'2027-02-01',100,'user-21b');
  insert into public.commission_plan_tiers(company_id,version_id,tier_order,rate_bp,threshold_mills) values
    ('21000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000043',1,500,500000),
    ('21000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000043',2,800,1000000);
  begin
    insert into public.commission_plan_tiers(company_id,version_id,tier_order,rate_bp,threshold_mills)
      values ('21000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000043',1,500,500000);
    raise exception 'Duplicate tier order accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into public.commission_plan_tiers(company_id,version_id,tier_order,rate_bp,threshold_mills)
      values ('21000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000043',0,500,500000);
    raise exception 'tier_order 0 accepted';
  exception when check_violation then null;
  end;
  -- Overrides: owner saves service-wide and staff rows; backdating refused.
  insert into public.service_commission_overrides(company_id,service_id,override_kind,rate_bp,created_by)
    values ('21000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000032','rate_bp',1500,'user-21b');
  insert into public.service_commission_overrides(company_id,service_id,staff_id,override_kind,fixed_mills,created_by)
    values ('21000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000032','21000000-0000-4000-8000-000000000021','fixed_mills',5000,'user-21b');
  begin
    insert into public.service_commission_overrides(company_id,service_id,override_kind,rate_bp,created_by,effective_from)
      values ('21000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000033','rate_bp',1000,'user-21b',now()-interval '1 hour');
    raise exception 'Backdated override accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.service_commission_overrides(company_id,service_id,override_kind,rate_bp,created_by,effective_from)
      values ('21000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000033','rate_bp',1000,'user-21b',now()+interval '1 hour');
    raise exception 'Scheduled override accepted';
  exception when insufficient_privilege then null;
  end;
  -- Owner records a salary; audit written by the trigger.
  insert into public.staff_salaries(company_id,staff_id,salary_mills,effective_date,recorded_by)
    values ('21000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000021',450000,'2027-01-01','user-21b');
  if not exists(select 1 from public.audit_log where action='staff_salary.recorded')
    then raise exception 'Salary audit missing'; end if;
  -- A salary may not start inside or before a closed month (Waleed 2026-11-20).
  insert into public.closed_commission_months(company_id,period_month,closed_by)
    values ('21000000-0000-4000-8000-000000000002','2026-10-01','user-21b');
  begin
    insert into public.staff_salaries(company_id,staff_id,salary_mills,effective_date,recorded_by)
      values ('21000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000021',460000,'2026-10-15','user-21b');
    raise exception 'Salary inside a closed month accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.staff_salaries(company_id,staff_id,salary_mills,effective_date,recorded_by)
      values ('21000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000021',460000,'2026-09-01','user-21b');
    raise exception 'Salary before a closed month accepted';
  exception when insufficient_privilege then null;
  end;
  -- No UPDATE/DELETE on the three new tables.
  begin update public.commission_plan_tiers set rate_bp=1; raise exception 'tiers update allowed'; exception when insufficient_privilege then null; end;
  begin delete from public.commission_plan_tiers; raise exception 'tiers delete allowed'; exception when insufficient_privilege then null; end;
  begin update public.service_commission_overrides set rate_bp=1; raise exception 'overrides update allowed'; exception when insufficient_privilege then null; end;
  begin delete from public.service_commission_overrides; raise exception 'overrides delete allowed'; exception when insufficient_privilege then null; end;
  begin update public.staff_salaries set salary_mills=1; raise exception 'salaries update allowed'; exception when insufficient_privilege then null; end;
  begin delete from public.staff_salaries; raise exception 'salaries delete allowed'; exception when insufficient_privilege then null; end;
end $$;

select set_config('app.user_id','user-21bm1',true);
do $$ declare v_count int;
begin
  -- Branch-scoped salary reads and writes (Q2).
  select count(*) into v_count from public.staff_salaries where staff_id='21000000-0000-4000-8000-000000000021';
  if v_count <> 1 then raise exception 'Branch 1 manager cannot read its staff salary'; end if;
  if exists(select 1 from public.staff_salaries where staff_id='21000000-0000-4000-8000-000000000022')
    then raise exception 'LEAK Branch 2 salary to Branch 1 manager'; end if;
  insert into public.staff_salaries(company_id,staff_id,salary_mills,effective_date,recorded_by)
    values ('21000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000021',500000,'2027-02-15','user-21bm1');
  begin
    insert into public.staff_salaries(company_id,staff_id,salary_mills,effective_date,recorded_by)
      values ('21000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000022',900000,'2027-02-01','user-21bm1');
    raise exception 'Branch 1 manager wrote a Branch 2 salary';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.staff_salaries(company_id,staff_id,salary_mills,effective_date,recorded_by)
      values ('21000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000021',1,'2027-03-01','user-21b');
    raise exception 'Salary accepted a spoofed recorded_by';
  exception when insufficient_privilege then null;
  end;
  -- Without commissions.overrides.manage the manager cannot insert overrides.
  begin
    insert into public.service_commission_overrides(company_id,service_id,override_kind,rate_bp,created_by)
      values ('21000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000033','rate_bp',1000,'user-21bm1');
    raise exception 'Ungranted manager wrote a service-wide override';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.service_commission_overrides(company_id,service_id,staff_id,override_kind,fixed_mills,created_by)
      values ('21000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000033','21000000-0000-4000-8000-000000000021','fixed_mills',2000,'user-21bm1');
    raise exception 'Ungranted manager wrote a staff override';
  exception when insufficient_privilege then null;
  end;
  -- Reads follow the plan-manager/assigner split.
  if not exists(select 1 from public.service_commission_overrides where staff_id is null)
    then raise exception 'Manager cannot read service-wide overrides'; end if;
  if not exists(select 1 from public.service_commission_overrides where staff_id='21000000-0000-4000-8000-000000000021')
    then raise exception 'Manager cannot read its branch staff override'; end if;
end $$;

select set_config('app.user_id','user-21b',true);
do $$ begin
  -- Owner grants commissions.overrides.manage to the Branch 1 manager.
  insert into public.permission_overrides(company_id,user_id,permission,effect)
    values ('21000000-0000-4000-8000-000000000002','user-21bm1','commissions.overrides.manage','allow');
end $$;

select set_config('app.user_id','user-21bm1',true);
do $$ begin
  -- With the grant: service-wide and own-branch staff overrides save;
  -- another branch's staff override is refused.
  insert into public.service_commission_overrides(company_id,service_id,override_kind,rate_bp,created_by)
    values ('21000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000033','rate_bp',1000,'user-21bm1');
  insert into public.service_commission_overrides(company_id,service_id,staff_id,override_kind,fixed_mills,created_by)
    values ('21000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000033','21000000-0000-4000-8000-000000000021','fixed_mills',2000,'user-21bm1');
  begin
    insert into public.service_commission_overrides(company_id,service_id,staff_id,override_kind,fixed_mills,created_by)
      values ('21000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000033','21000000-0000-4000-8000-000000000022','fixed_mills',2000,'user-21bm1');
    raise exception 'Granted manager wrote another branch staff override';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('app.user_id','user-21rec',true);
do $$ begin
  if exists(select 1 from public.commission_plan_tiers) then raise exception 'Reception read tiers'; end if;
  if exists(select 1 from public.service_commission_overrides) then raise exception 'Reception read overrides'; end if;
  if exists(select 1 from public.staff_salaries) then raise exception 'Reception read salaries'; end if;
  begin
    insert into public.commission_plan_tiers(company_id,version_id,tier_order,rate_bp,threshold_mills)
      values ('21000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000043',3,500,500000);
    raise exception 'Reception wrote a tier';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.service_commission_overrides(company_id,service_id,override_kind,rate_bp,created_by)
      values ('21000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000032','rate_bp',100,'user-21rec');
    raise exception 'Reception wrote an override';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.staff_salaries(company_id,staff_id,salary_mills,effective_date,recorded_by)
      values ('21000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000021',1,'2027-01-01','user-21rec');
    raise exception 'Reception wrote a salary';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('app.user_id','user-21a',true);
do $$ begin
  -- Company A salary writing works in its own company but B stays invisible.
  insert into public.staff_salaries(company_id,staff_id,salary_mills,effective_date,recorded_by)
    values ('21000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000023',300000,'2027-01-01','user-21a');
  if exists(select 1 from public.staff_salaries where company_id='21000000-0000-4000-8000-000000000002')
    then raise exception 'LEAK foreign salaries'; end if;
end $$;

reset role;
rollback;
\echo 'isolation: PASS'
