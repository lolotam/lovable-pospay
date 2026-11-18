-- Approved D-13: one method, manager issuance, immediate revocation.
create or replace function public.card_manager(_company uuid, _branch uuid default null) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from memberships where company_id=_company and user_id=public.current_app_user()
 and role='branch_manager' and (_branch is null or branch_id is null or branch_id=_branch))
 and not exists(select 1 from permission_overrides where company_id=_company and user_id=public.current_app_user()
 and permission='attendance.manage_cards' and effect='deny')
$$;
create or replace function public.card_operator(_company uuid, _branch uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from memberships where company_id=_company
 and user_id=public.current_app_user() and role in ('branch_manager','reception') and (branch_id is null or branch_id=_branch))
 and not exists(select 1 from permission_overrides where company_id=_company and user_id=public.current_app_user()
 and permission='attendance.record' and effect='deny')
$$;
revoke all on function public.card_manager(uuid,uuid), public.card_operator(uuid,uuid) from public;
grant execute on function public.card_manager(uuid,uuid), public.card_operator(uuid,uuid) to pospay_app;
create table if not exists public.card_policies (
 company_id uuid primary key references public.companies(id) on delete cascade,
 approved_by text not null, approved_at timestamptz not null default now(),
 manager_only boolean not null default true check(manager_only),
 immediate_revoke boolean not null default true check(immediate_revoke),
 single_method boolean not null default true check(single_method)
);
grant select, insert on public.card_policies to pospay_app;
alter table public.card_policies enable row level security;
drop policy if exists card_policy_read on public.card_policies;
create policy card_policy_read on public.card_policies for select to pospay_app using(public.is_member(company_id));
drop policy if exists card_policy_approve on public.card_policies;
create policy card_policy_approve on public.card_policies for insert to pospay_app with check(public.card_manager(company_id) and approved_by=public.current_app_user());
create table if not exists public.attendance_cards (
 company_id uuid not null references public.companies(id) on delete cascade,
 id uuid not null default gen_random_uuid(), staff_id uuid not null,
 token_hash text not null unique check(length(token_hash)=64),
 issued_by text not null, issued_at timestamptz not null default now(),
 revoked_by text, revoked_at timestamptz,
 primary key(company_id,id), foreign key(company_id,staff_id) references public.staff_members(company_id,id),
 check((revoked_at is null)=(revoked_by is null))
);
grant select,insert,update on public.attendance_cards to pospay_app;
alter table public.attendance_cards enable row level security;
create unique index if not exists one_active_card on public.attendance_cards(company_id,staff_id) where revoked_at is null;
drop policy if exists cards_read on public.attendance_cards;
create policy cards_read on public.attendance_cards for select to pospay_app using(exists(select 1 from staff_members s where s.company_id=attendance_cards.company_id and s.id=staff_id and (public.card_manager(s.company_id,s.branch_id) or public.card_operator(s.company_id,s.branch_id) or public.has_company_role(s.company_id,'owner'))));
drop policy if exists cards_issue on public.attendance_cards;
create policy cards_issue on public.attendance_cards for insert to pospay_app with check(issued_by=public.current_app_user() and exists(select 1 from staff_members s where s.company_id=attendance_cards.company_id and s.id=staff_id and public.card_manager(s.company_id,s.branch_id)) and exists(select 1 from card_policies p where p.company_id=attendance_cards.company_id));
drop policy if exists cards_revoke on public.attendance_cards;
create policy cards_revoke on public.attendance_cards for update to pospay_app using(exists(select 1 from staff_members s where s.company_id=attendance_cards.company_id and s.id=staff_id and public.card_manager(s.company_id,s.branch_id))) with check(revoked_by=public.current_app_user() and revoked_at is not null);
create or replace function public.enforce_card_method() returns trigger language plpgsql security definer set search_path=public as $$
 declare u text;
 begin
 select user_id into u from staff_members where company_id=new.company_id and id=new.staff_id for update;
 if TG_OP='UPDATE' then
  if old.revoked_at is not null or new.token_hash<>old.token_hash or new.staff_id<>old.staff_id or new.company_id<>old.company_id or new.issued_by<>old.issued_by or new.issued_at<>old.issued_at then raise exception 'CARD_IMMUTABLE'; end if;
 end if;
 if new.revoked_at is null and exists(select 1 from phone_bindings where company_id=new.company_id and user_id=u) then raise exception 'ACTIVE_PHONE'; end if;
 return new;
 end $$;
create or replace function public.enforce_phone_method() returns trigger language plpgsql security definer set search_path=public as $$
 declare s uuid;
 begin
 select id into s from staff_members where company_id=new.company_id and user_id=new.user_id for update;
 if exists(select 1 from attendance_cards where company_id=new.company_id and staff_id=s and revoked_at is null) then raise exception 'ACTIVE_CARD'; end if;
 return new;
 end $$;
revoke all on function public.enforce_card_method(),public.enforce_phone_method() from public;
drop trigger if exists card_method on public.attendance_cards;
create trigger card_method before insert or update on public.attendance_cards for each row execute function public.enforce_card_method();
drop trigger if exists phone_method on public.phone_bindings;
create trigger phone_method before insert on public.phone_bindings for each row execute function public.enforce_phone_method();
drop policy if exists attendance_card_insert on public.attendance_records;
create policy attendance_card_insert on public.attendance_records for insert to pospay_app with check(public.card_operator(company_id,branch_id) and exists(select 1 from staff_members s where s.company_id=attendance_records.company_id and s.id=staff_id and s.branch_id=attendance_records.branch_id));
drop policy if exists attendance_card_read on public.attendance_records;
create policy attendance_card_read on public.attendance_records for select to pospay_app using(public.card_operator(company_id,branch_id));
drop policy if exists attendance_card_update on public.attendance_records;
create policy attendance_card_update on public.attendance_records for update to pospay_app using(public.card_operator(company_id,branch_id)) with check(public.card_operator(company_id,branch_id));
drop policy if exists shifts_card_read on public.shifts;
create policy shifts_card_read on public.shifts for select to pospay_app using(exists(select 1 from staff_members s where s.company_id=shifts.company_id and s.id=staff_id and public.card_operator(s.company_id,s.branch_id)));

create or replace function public.card_staff_allowed(_company uuid,_staff uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from staff_members s where s.company_id=_company and s.id=_staff
 and public.card_operator(s.company_id,s.branch_id)
 and not exists(select 1 from permission_overrides p where p.company_id=s.company_id and p.user_id=s.user_id and p.permission='attendance.record' and p.effect='deny'))
$$;
revoke all on function public.card_staff_allowed(uuid,uuid) from public;
grant execute on function public.card_staff_allowed(uuid,uuid) to pospay_app;

-- Reception may serialize card scans without general staff update access.
create or replace function public.lock_staff_for_card_scan(_company uuid, _staff uuid) returns uuid
language sql volatile security definer set search_path=pg_catalog as $$
 select s.id from public.staff_members s
 where s.company_id=_company and s.id=_staff
 and public.card_staff_allowed(s.company_id,s.id)
 for update of s
$$;
revoke all on function public.lock_staff_for_card_scan(uuid,uuid) from public;
grant execute on function public.lock_staff_for_card_scan(uuid,uuid) to pospay_app;
