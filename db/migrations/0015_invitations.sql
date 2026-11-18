-- Invite-only accounts (Waleed 2026-11-18): owner/branch manager invites by email; no public sign-up.
create table if not exists public.invitations (
 company_id uuid not null references public.companies(id) on delete cascade,
 id uuid not null default gen_random_uuid(),
 email text not null check(email=lower(email) and position('@' in email)>1),
 role public.company_role not null check(role<>'owner'),
 branch_id uuid references public.branches(id) on delete set null,
 token_hash text not null unique check(length(token_hash)=64),
 expires_at timestamptz not null,
 invited_by text not null, created_at timestamptz not null default now(),
 accepted_at timestamptz, accepted_user_id text, revoked_at timestamptz,
 primary key(company_id,id)
);
create unique index if not exists invitations_pending_uq on public.invitations(company_id,email) where accepted_at is null and revoked_at is null;
alter table public.invitations enable row level security;
create or replace function public.can_invite(_company uuid, _role public.company_role) returns boolean
language sql stable security definer set search_path=public as $$
 select _role<>'owner' and (public.has_company_role(_company,'owner')
  or (public.has_company_role(_company,'branch_manager') and _role<>'branch_manager')) $$;
revoke all on function public.can_invite(uuid,public.company_role) from public;
grant execute on function public.can_invite(uuid,public.company_role) to pospay_app;
grant select,insert,update on public.invitations to pospay_app;
drop policy if exists invitations_read on public.invitations;
create policy invitations_read on public.invitations for select to pospay_app using(public.has_company_role(company_id,'owner') or public.has_company_role(company_id,'branch_manager'));
drop policy if exists invitations_insert on public.invitations;
create policy invitations_insert on public.invitations for insert to pospay_app with check(public.can_invite(company_id,role) and invited_by=public.current_app_user() and accepted_at is null and revoked_at is null);
drop policy if exists invitations_revoke on public.invitations;
create policy invitations_revoke on public.invitations for update to pospay_app using(public.can_invite(company_id,role) and accepted_at is null) with check(public.can_invite(company_id,role) and accepted_at is null);
-- Token holder preview: only valid, pending invitations; the token itself is the secret.
create or replace function public.invitation_preview(_token_hash text)
returns table(email text, role public.company_role, company_name text)
language sql stable security definer set search_path=public as $$
 select i.email,i.role,c.name from public.invitations i join public.companies c on c.id=i.company_id
 where i.token_hash=_token_hash and i.accepted_at is null and i.revoked_at is null and i.expires_at>now() $$;
-- Accept as the signed-in app user; email must match; single use.
create or replace function public.accept_invitation(_token_hash text, _email text) returns uuid
language plpgsql security definer set search_path=public as $$
declare inv public.invitations; uid text := public.current_app_user();
begin
 if uid is null then raise exception 'UNAUTHENTICATED'; end if;
 select * into inv from public.invitations where token_hash=_token_hash for update;
 if not found or inv.accepted_at is not null or inv.revoked_at is not null or inv.expires_at<=now() then raise exception 'INVITE_INVALID'; end if;
 if inv.email<>lower(_email) then raise exception 'INVITE_EMAIL_MISMATCH'; end if;
 insert into public.memberships(company_id,user_id,role,branch_id) values(inv.company_id,uid,inv.role,inv.branch_id) on conflict(company_id,user_id,role) do nothing;
 update public.invitations set accepted_at=now(),accepted_user_id=uid where company_id=inv.company_id and id=inv.id;
 insert into public.audit_log(company_id,actor_user_id,action,entity,entity_id,details) values(inv.company_id,uid,'invitation.accepted','invitation',inv.id::text,jsonb_build_object('role',inv.role));
 return inv.company_id;
end $$;
revoke all on function public.invitation_preview(text) from public;
revoke all on function public.accept_invitation(text,text) from public;
grant execute on function public.invitation_preview(text) to pospay_app;
grant execute on function public.accept_invitation(text,text) to pospay_app;
