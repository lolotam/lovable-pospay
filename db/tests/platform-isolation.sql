begin;
insert into public.platform_admins (user_id) values ('super-1');
insert into public.companies (id,name) values ('20000000-0000-0000-0000-000000000001','Salon');
insert into public.memberships (company_id,user_id,role) values ('20000000-0000-0000-0000-000000000001','owner-1','owner');
insert into public.platform_credentials (provider,kind,secret,updated_by) values ('openai','api_key','cipher','super-1');
set local role pospay_app;
select set_config('app.user_id','owner-1',true);
do $$ begin
  if public.is_super_admin() then raise exception 'Owner treated as super admin'; end if;
  if exists (select 1 from public.platform_credentials) then raise exception 'LEAK credentials to owner'; end if;
  begin
    insert into public.platform_credentials (provider,kind,secret,updated_by) values ('kimi','api_key','x','owner-1');
    raise exception 'Owner wrote credential';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.platform_admins (user_id) values ('owner-1');
    raise exception 'Owner promoted self';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.platform_settings (key,value) values ('ai.default','x');
    raise exception 'Owner wrote setting';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('app.user_id','super-1',true);
do $$ begin
  if not public.is_super_admin() then raise exception 'Super admin not recognised'; end if;
  if (select count(*) from public.platform_credentials) <> 1 then raise exception 'Super admin cannot read'; end if;
end $$;
insert into public.platform_settings (key,value) values ('ai.default','codex');
rollback;
select 'PASS platform isolation' as result;
