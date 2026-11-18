-- Invite-only accounts: manager limits, single use, email match, expiry.
begin;
insert into public.companies(id,name) values ('00000000-0000-0000-0000-0000000000c1','Inv salon');
insert into public.memberships(company_id,user_id,role) values ('00000000-0000-0000-0000-0000000000c1','inv-owner','owner'),('00000000-0000-0000-0000-0000000000c1','inv-mgr','branch_manager'),('00000000-0000-0000-0000-0000000000c1','inv-rec','reception');
insert into public."user"(id,email,name,"emailVerified") values ('new-user','new@x.test','New',true);
set local role pospay_app;
select set_config('app.user_id','inv-mgr',true);
do $$ begin
  begin insert into public.invitations(company_id,email,role,token_hash,expires_at,invited_by) values ('00000000-0000-0000-0000-0000000000c1','m@x.test','branch_manager',repeat('1',64),now()+interval '1 day','inv-mgr'); raise exception 'FAIL manager invited manager'; exception when insufficient_privilege or check_violation then null; end;
  insert into public.invitations(company_id,email,role,token_hash,expires_at,invited_by) values ('00000000-0000-0000-0000-0000000000c1','new@x.test','reception',repeat('2',64),now()+interval '1 day','inv-mgr');
  insert into public.invitations(company_id,email,role,token_hash,expires_at,invited_by) values ('00000000-0000-0000-0000-0000000000c1','old@x.test','staff',repeat('3',64),now()-interval '1 minute','inv-mgr');
end $$;
select set_config('app.user_id','inv-rec',true);
do $$ begin
  begin insert into public.invitations(company_id,email,role,token_hash,expires_at,invited_by) values ('00000000-0000-0000-0000-0000000000c1','r@x.test','staff',repeat('4',64),now()+interval '1 day','inv-rec'); raise exception 'FAIL reception invited'; exception when insufficient_privilege then null; end;
end $$;
select set_config('app.user_id','new-user',true);
do $$ begin
  begin perform public.accept_invitation(repeat('2',64),'other@x.test'); raise exception 'FAIL email mismatch'; exception when raise_exception then if sqlerrm<>'INVITE_EMAIL_MISMATCH' then raise; end if; end;
  begin perform public.accept_invitation(repeat('3',64),'old@x.test'); raise exception 'FAIL expired'; exception when raise_exception then if sqlerrm<>'INVITE_INVALID' then raise; end if; end;
  perform public.accept_invitation(repeat('2',64),'NEW@x.test');
  if not exists(select 1 from public.memberships where user_id='new-user' and role='reception') then raise exception 'FAIL membership'; end if;
  begin perform public.accept_invitation(repeat('2',64),'new@x.test'); raise exception 'FAIL reuse'; exception when raise_exception then if sqlerrm<>'INVITE_INVALID' then raise; end if; end;
  if exists(select 1 from public.invitation_preview(repeat('2',64))) then raise exception 'FAIL preview after use'; end if;
end $$;
select 'invitations PASS';
rollback;
