-- 0015 follow-up: an invitation's branch belongs to its company, a branch manager invites only
-- inside their own branch scope, and acceptance is bound to the signed-in verified email.
alter table public.invitations drop constraint if exists invitations_branch_id_fkey;
do $$ begin
  alter table public.invitations add constraint invitations_company_branch_fkey
    foreign key (company_id, branch_id) references public.branches(company_id, id) on delete cascade;
exception when duplicate_object then null; end $$;

create or replace function public.can_invite_into(_company uuid, _role public.company_role, _branch uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select _role<>'owner' and (public.has_company_role(_company,'owner')
  or (_role<>'branch_manager' and exists(select 1 from public.memberships m
   where m.company_id=_company and m.user_id=public.current_app_user() and m.role='branch_manager'
    and (m.branch_id is null or m.branch_id=_branch)))) $$;
revoke all on function public.can_invite_into(uuid,public.company_role,uuid) from public;
grant execute on function public.can_invite_into(uuid,public.company_role,uuid) to pospay_app;

drop policy if exists invitations_insert on public.invitations;
create policy invitations_insert on public.invitations for insert to pospay_app
 with check(public.can_invite_into(company_id,role,branch_id) and invited_by=public.current_app_user()
  and accepted_at is null and revoked_at is null);
drop policy if exists invitations_revoke on public.invitations;
create policy invitations_revoke on public.invitations for update to pospay_app
 using(public.can_invite_into(company_id,role,branch_id) and accepted_at is null)
 with check(public.can_invite_into(company_id,role,branch_id) and accepted_at is null);
drop function if exists public.can_invite(uuid,public.company_role);

create or replace function public.accept_invitation(_token_hash text, _email text) returns uuid
language plpgsql security definer set search_path=public as $$
declare inv public.invitations; uid text := public.current_app_user();
begin
 if uid is null then raise exception 'UNAUTHENTICATED'; end if;
 select * into inv from public.invitations where token_hash=_token_hash for update;
 if not found or inv.accepted_at is not null or inv.revoked_at is not null or inv.expires_at<=now() then raise exception 'INVITE_INVALID'; end if;
 if inv.email<>lower(_email) or not exists(select 1 from public."user" u
   where u.id=uid and lower(u.email)=inv.email and u."emailVerified") then raise exception 'INVITE_EMAIL_MISMATCH'; end if;
 insert into public.memberships(company_id,user_id,role,branch_id) values(inv.company_id,uid,inv.role,inv.branch_id) on conflict(company_id,user_id,role) do nothing;
 update public.invitations set accepted_at=now(),accepted_user_id=uid where company_id=inv.company_id and id=inv.id;
 insert into public.audit_log(company_id,actor_user_id,action,entity,entity_id,details) values(inv.company_id,uid,'invitation.accepted','invitation',inv.id::text,jsonb_build_object('role',inv.role));
 return inv.company_id;
end $$;
revoke all on function public.accept_invitation(text,text) from public;
grant execute on function public.accept_invitation(text,text) to pospay_app;
