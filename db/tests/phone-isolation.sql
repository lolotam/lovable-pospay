begin;
insert into public.companies (id,name) values ('10000000-0000-0000-0000-000000000001','Phone A'),('10000000-0000-0000-0000-000000000002','Phone B');
insert into public.branches (id,company_id,name) values ('10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','A');
insert into public.memberships (company_id,user_id,role) values
 ('10000000-0000-0000-0000-000000000001','phone-a','staff'),
 ('10000000-0000-0000-0000-000000000001','phone-manager','branch_manager'),
 ('10000000-0000-0000-0000-000000000002','phone-b','staff');
insert into public.staff_members (company_id,branch_id,user_id,display_name) values ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','phone-a','A');
insert into public.phone_bindings (company_id,user_id,credential_id,device_hash) values ('10000000-0000-0000-0000-000000000002','phone-b','b','device-b');
set local role pospay_app;
select set_config('app.user_id','phone-a',true);
insert into public.phone_bindings (company_id,user_id,credential_id,device_hash) values ('10000000-0000-0000-0000-000000000001','phone-a','a','device-a');
do $$ begin
 if (select count(*) from public.phone_bindings)<>1 then raise exception 'LEAK phones'; end if;
 delete from public.phone_bindings;
 if found then raise exception 'Staff unbound phone'; end if;
 begin
  insert into public.phone_bindings (company_id,user_id,credential_id,device_hash) values ('10000000-0000-0000-0000-000000000001','phone-a','c','other');
  raise exception 'Second phone accepted';
 exception when unique_violation then null; end;
 begin
  insert into public.phone_bindings (company_id,user_id,credential_id,device_hash) values ('10000000-0000-0000-0000-000000000001','phone-b','c','other');
  raise exception 'Other employee binding accepted';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('app.user_id','phone-manager',true);
delete from public.phone_bindings where user_id='phone-a';
do $$ begin
 if exists (select 1 from public.phone_bindings) then raise exception 'Manager unbinding failed'; end if;
end $$;
reset role;
rollback;
\echo 'phone isolation: PASS'