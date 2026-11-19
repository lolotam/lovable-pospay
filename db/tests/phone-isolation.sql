begin;
insert into public.companies (id,name) values ('10000000-0000-0000-0000-000000000001','Phone A'),('10000000-0000-0000-0000-000000000002','Phone B');
insert into public.branches (id,company_id,name) values ('10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','A');
insert into public.memberships (company_id,user_id,role) values
 ('10000000-0000-0000-0000-000000000001','phone-a','staff'),
 ('10000000-0000-0000-0000-000000000001','phone-manager','branch_manager'),
 ('10000000-0000-0000-0000-000000000001','phone-denied-manager','branch_manager'),
 ('10000000-0000-0000-0000-000000000001','phone-owner','owner'),
 ('10000000-0000-0000-0000-000000000001','phone-c','staff'),
 ('10000000-0000-0000-0000-000000000002','phone-b','staff');
insert into public.staff_members (company_id,branch_id,user_id,display_name) values ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','phone-a','A');
insert into public.phone_bindings (company_id,user_id,credential_id,device_hash) values ('10000000-0000-0000-0000-000000000002','phone-b','b','device-b'),
 ('10000000-0000-0000-0000-000000000001','phone-c','c','device-c'),
 ('10000000-0000-0000-0000-000000000001','phone-gone','g','device-g');
insert into public.permission_overrides (company_id,user_id,permission,effect) values
 ('10000000-0000-0000-0000-000000000001','phone-denied-manager','attendance.manage_devices','deny'),
 ('10000000-0000-0000-0000-000000000001','phone-owner','attendance.manage_devices','deny');
set local role pospay_app;
select set_config('app.user_id','phone-a',true);
insert into public.phone_bindings (company_id,user_id,credential_id,device_hash) values ('10000000-0000-0000-0000-000000000001','phone-a','a','device-a');
do $$ begin
 if (select count(*) from public.phone_bindings)<>1 then raise exception 'LEAK phones'; end if;
 perform id from public.phone_bindings where user_id='phone-a' for update;
 if not found then raise exception 'Staff could not lock own phone'; end if;
 perform id from public.phone_bindings where user_id='phone-b' for update;
 if found then raise exception 'Staff locked another company phone'; end if;
 begin
  update public.phone_bindings set id=gen_random_uuid() where user_id='phone-a';
  raise exception 'Staff changed phone binding ID';
 exception when insufficient_privilege then null; end;
 delete from public.phone_bindings where user_id<>'phone-a';
 if found then raise exception 'Staff unbound another member phone'; end if;
 delete from public.phone_bindings where user_id='phone-a';
 if not found then raise exception 'Staff could not unbind own phone'; end if;
 insert into public.phone_bindings (company_id,user_id,credential_id,device_hash) values ('10000000-0000-0000-0000-000000000001','phone-a','a','device-a');
 begin
  insert into public.phone_bindings (company_id,user_id,credential_id,device_hash) values ('10000000-0000-0000-0000-000000000001','phone-a','c','other');
  raise exception 'Second phone accepted';
 exception when unique_violation then null; end;
 begin
  insert into public.phone_bindings (company_id,user_id,credential_id,device_hash) values ('10000000-0000-0000-0000-000000000001','phone-b','c','other');
  raise exception 'Other employee binding accepted';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('app.user_id','phone-gone',true);
do $$ begin
 delete from public.phone_bindings where user_id='phone-gone';
 if found then raise exception 'Former member unbound own phone'; end if;
end $$;
select set_config('app.user_id','phone-manager',true);
do $$ begin
 perform id from public.phone_bindings where user_id='phone-a' for update;
 if found then raise exception 'Manager locked another user phone'; end if;
end $$;
delete from public.phone_bindings where user_id='phone-c';
do $$ begin
 if exists (select 1 from public.phone_bindings where user_id='phone-c') then raise exception 'Manager unbinding failed'; end if;
end $$;
select set_config('app.user_id','phone-denied-manager',true);
do $$ begin
 delete from public.phone_bindings where user_id='phone-a';
 if found then raise exception 'Manager with manage_devices deny unbound phone'; end if;
end $$;
select set_config('app.user_id','phone-owner',true);
delete from public.phone_bindings where user_id in ('phone-a','phone-gone');
do $$ begin
 if exists (select 1 from public.phone_bindings) then raise exception 'Owner unbinding ignored D-31'; end if;
end $$;
reset role;
rollback;
\echo 'phone isolation: PASS'
