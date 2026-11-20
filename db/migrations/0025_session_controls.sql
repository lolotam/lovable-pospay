-- 020: price surcharges with reason, manager PIN & remote approval for over-limit
-- discounts, duplicate warning, audited session editing with owner month close.
-- pgcrypto may live in `public` (self-hosted) or `extensions` (Supabase layout).

-- Tables --------------------------------------------------------------------

create table if not exists public.manager_pins (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id text not null,
  pin_hash text not null,
  updated_at timestamptz not null default now(),
  primary key (company_id, user_id)
);
revoke all on public.manager_pins from public, pospay_app;
alter table public.manager_pins enable row level security;

create table if not exists public.manager_pin_attempts (
  company_id uuid not null references public.companies(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  branch_id uuid not null,
  session_id uuid not null,
  approver_user_id text not null,
  requested_by text not null,
  user_agent text check (user_agent is null or length(user_agent) <= 200),
  attempted_at timestamptz not null default clock_timestamp(),
  primary key (company_id, id),
  foreign key (company_id, branch_id) references public.branches(company_id, id)
);
create index if not exists manager_pin_attempts_branch_time
  on public.manager_pin_attempts(company_id, branch_id, attempted_at desc);
revoke all on public.manager_pin_attempts from public, pospay_app;
grant select on public.manager_pin_attempts to pospay_app;
alter table public.manager_pin_attempts enable row level security;

create table if not exists public.discount_approvals (
  company_id uuid not null references public.companies(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  branch_id uuid not null,
  session_id uuid not null,
  service_id uuid not null,
  list_price_mills bigint not null check (list_price_mills >= 0),
  approved_price_mills bigint not null check (approved_price_mills >= 0),
  approver_user_id text not null,
  requested_by text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  source text not null check (source in ('pin','remote')),
  request_id uuid,
  primary key (company_id, id),
  foreign key (company_id, branch_id) references public.branches(company_id, id),
  foreign key (company_id, service_id) references public.service_catalog(company_id, id),
  check ((source = 'remote') = (request_id is not null))
);
revoke all on public.discount_approvals from public, pospay_app;
grant select on public.discount_approvals to pospay_app;
alter table public.discount_approvals enable row level security;

create table if not exists public.discount_approval_requests (
  company_id uuid not null references public.companies(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  branch_id uuid not null,
  session_id uuid not null,
  service_id uuid not null,
  list_price_mills bigint not null check (list_price_mills >= 0),
  requested_price_mills bigint not null check (requested_price_mills >= 0 and requested_price_mills < list_price_mills),
  discount_reason text not null check (length(trim(discount_reason)) between 1 and 200),
  requested_by text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','superseded')),
  decided_by text,
  decided_at timestamptz,
  approval_id uuid,
  primary key (company_id, id),
  foreign key (company_id, branch_id) references public.branches(company_id, id),
  foreign key (company_id, service_id) references public.service_catalog(company_id, id),
  check ((status in ('approved','rejected')) = (decided_by is not null and decided_at is not null)),
  check ((status = 'approved') = (approval_id is not null))
);
create index if not exists discount_approval_requests_branch_status
  on public.discount_approval_requests(company_id, branch_id, status, expires_at);
revoke all on public.discount_approval_requests from public, pospay_app;
grant select on public.discount_approval_requests to pospay_app;
alter table public.discount_approval_requests enable row level security;

do $$ begin
 if not exists(select 1 from pg_constraint where conname='discount_approval_requests_approval_fk' and conrelid='public.discount_approval_requests'::regclass) then
  alter table public.discount_approval_requests add constraint discount_approval_requests_approval_fk
   foreign key (company_id, approval_id) references public.discount_approvals(company_id, id);
 end if;
end $$;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='discount_approvals_request_fk' and conrelid='public.discount_approvals'::regclass) then
  alter table public.discount_approvals add constraint discount_approvals_request_fk
   foreign key (company_id, request_id) references public.discount_approval_requests(company_id, id);
 end if;
end $$;

create table if not exists public.closed_commission_months (
  company_id uuid not null references public.companies(id) on delete cascade,
  period_month date not null check (extract(day from period_month) = 1),
  closed_by text not null,
  closed_at timestamptz not null default now(),
  note text check (note is null or length(trim(note)) <= 200),
  primary key (company_id, period_month)
);
revoke all on public.closed_commission_months from public;
grant select, insert on public.closed_commission_months to pospay_app;
alter table public.closed_commission_months enable row level security;

create table if not exists public.service_session_edits (
  company_id uuid not null references public.companies(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  session_id uuid not null,
  edited_by text not null,
  edited_at timestamptz not null default now(),
  edit_reason text not null check (length(trim(edit_reason)) between 1 and 200),
  before_snapshot jsonb not null,
  after_snapshot jsonb not null,
  primary key (company_id, id),
  foreign key (company_id, session_id) references public.service_sessions(company_id, id)
);
create index if not exists service_session_edits_history
  on public.service_session_edits(company_id, session_id, edited_at desc);
revoke all on public.service_session_edits from public;
grant select on public.service_session_edits to pospay_app;
alter table public.service_session_edits enable row level security;

-- service_sessions approval/edit columns ------------------------------------

alter table public.service_sessions add column if not exists approved_by text;
alter table public.service_sessions add column if not exists approved_at timestamptz;
alter table public.service_sessions add column if not exists approval_id uuid;
alter table public.service_sessions add column if not exists updated_at timestamptz;
alter table public.service_sessions add column if not exists updated_by text;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='service_sessions_approval_fk' and conrelid='public.service_sessions'::regclass) then
  alter table public.service_sessions add constraint service_sessions_approval_fk
   foreign key (company_id, approval_id) references public.discount_approvals(company_id, id);
 end if;
end $$;
create index if not exists service_sessions_duplicate_check
  on public.service_sessions(company_id, staff_id, service_id, occurred_at);
-- Single use of an approval is enforced by the database (Rule B5).
create unique index if not exists service_sessions_approval_once
  on public.service_sessions(company_id, approval_id) where approval_id is not null;

-- RLS helpers (created before the policies that reference them) --------------

create or replace function public.discount_approver(_company uuid, _branch uuid, _user text)
returns boolean
language sql stable security definer set search_path = public as $$
  select _user is not null and (
    exists (select 1 from public.memberships o
            where o.company_id = _company and o.user_id = _user and o.role = 'owner')
    or exists (select 1 from public.memberships m
               where m.company_id = _company and m.user_id = _user
                 and m.role = 'branch_manager'
                 and (m.branch_id is null or m.branch_id = _branch)
                 and not exists (select 1 from public.permission_overrides p
                                 where p.company_id = _company and p.user_id = _user
                                   and p.permission = 'discounts.manage' and p.effect = 'deny'))
  )
$$;
revoke all on function public.discount_approver(uuid,uuid,text) from public;
grant execute on function public.discount_approver(uuid,uuid,text) to pospay_app;

-- owner, OR holds sessions.edit with a branch_manager/reception membership
-- covering the branch (Rule D1); the role filter neutralizes a stray allow row.
create or replace function public.session_editor(_company uuid, _branch uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_company_role(_company, 'owner')
    or (public.has_permission(_company, 'sessions.edit')
        and exists (select 1 from public.memberships m
                    where m.company_id = _company
                      and m.user_id = public.current_app_user()
                      and m.role in ('branch_manager','reception')
                      and (m.branch_id is null or m.branch_id = _branch)))
$$;
revoke all on function public.session_editor(uuid,uuid) from public;
grant execute on function public.session_editor(uuid,uuid) to pospay_app;

create or replace function public.is_month_closed(_company uuid, _branch uuid, _at timestamptz)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.branches b
    join public.closed_commission_months c
      on c.company_id = b.company_id
     and c.period_month = date_trunc('month', _at at time zone b.timezone)::date
    where b.company_id = _company and b.id = _branch
  )
$$;
revoke all on function public.is_month_closed(uuid,uuid,timestamptz) from public;
grant execute on function public.is_month_closed(uuid,uuid,timestamptz) to pospay_app;

create or replace function public.valid_discount_approval(
  _company uuid, _approval uuid, _branch uuid, _session uuid, _service uuid,
  _list_price bigint, _price bigint, _approver text, _approved_at timestamptz)
returns boolean
language sql stable security definer set search_path = pg_catalog as $$
  select exists (
    select 1 from public.discount_approvals a
    where a.company_id = _company and a.id = _approval
      and a.branch_id = _branch and a.session_id = _session and a.service_id = _service
      and a.list_price_mills = _list_price and a.approved_price_mills = _price
      and a.approver_user_id = _approver and a.created_at = _approved_at
      and a.consumed_at is null and a.expires_at > now()
      and a.requested_by = public.current_app_user()
  )
$$;
revoke all on function public.valid_discount_approval(uuid,uuid,uuid,uuid,uuid,bigint,bigint,text,timestamptz) from public;
grant execute on function public.valid_discount_approval(uuid,uuid,uuid,uuid,uuid,bigint,bigint,text,timestamptz) to pospay_app;

create or replace function public.has_manager_pin(_company uuid)
returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  -- A non-member must not even learn whether a PIN exists in a foreign company.
  if not public.is_member(_company) then raise exception 'FORBIDDEN'; end if;
  return exists (select 1 from public.manager_pins p where p.company_id = _company);
end
$$;
revoke all on function public.has_manager_pin(uuid) from public;
grant execute on function public.has_manager_pin(uuid) to pospay_app;

-- The ق-1 floor: no manager approval needed at or above list, or within cap.
-- Single source for the sessions_insert policy and update_recorded_session.
create or replace function public.discount_within_cap(_company uuid, _list_price bigint, _price bigint)
returns boolean
language sql stable security definer set search_path = public as $$
  select _price >= _list_price
    or _price * 100 >= _list_price * (100 - public.discount_cap(_company))
$$;
revoke all on function public.discount_within_cap(uuid,bigint,bigint) from public;
grant execute on function public.discount_within_cap(uuid,bigint,bigint) to pospay_app;

-- Reads the session's current branch bypassing RLS: report readers AND editors
-- may see history (a plain subquery would be filtered by sessions_report).
create or replace function public.session_edits_visible(_company uuid, _session uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.service_sessions s
    where s.company_id = _company and s.id = _session
      and (public.report_reader(_company, s.branch_id)
           or public.session_editor(_company, s.branch_id))
  )
$$;
revoke all on function public.session_edits_visible(uuid,uuid) from public;
grant execute on function public.session_edits_visible(uuid,uuid) to pospay_app;

-- Policies -------------------------------------------------------------------

drop policy if exists manager_pin_attempts_read on public.manager_pin_attempts;
create policy manager_pin_attempts_read on public.manager_pin_attempts
  for select to pospay_app
  using (public.has_company_role(company_id, 'owner')
         or public.discount_approver(company_id, branch_id, public.current_app_user()));

drop policy if exists discount_approvals_read on public.discount_approvals;
create policy discount_approvals_read on public.discount_approvals
  for select to pospay_app
  using (public.discount_manager(company_id) or requested_by = public.current_app_user());

drop policy if exists discount_approval_requests_read on public.discount_approval_requests;
create policy discount_approval_requests_read on public.discount_approval_requests
  for select to pospay_app
  using (requested_by = public.current_app_user()
         or public.discount_approver(company_id, branch_id, public.current_app_user()));

drop policy if exists closed_months_read on public.closed_commission_months;
create policy closed_months_read on public.closed_commission_months
  for select to pospay_app
  using (public.is_member(company_id));
drop policy if exists closed_months_insert on public.closed_commission_months;
create policy closed_months_insert on public.closed_commission_months
  for insert to pospay_app
  with check (public.has_company_role(company_id, 'owner')
              and closed_by = public.current_app_user());

drop policy if exists session_edits_read on public.service_session_edits;
create policy session_edits_read on public.service_session_edits
  for select to pospay_app
  using (public.session_edits_visible(company_id, session_id));

-- sessions.edit defaults on for branch_manager (owner always true);
-- reception gets it only through an owner allow row in permission_overrides.
create or replace function public.role_default_permission(_role public.company_role, _permission text)
returns boolean
language sql immutable as $$
  select case _role
    when 'owner' then true
    when 'branch_manager' then _permission in
      ('reports.view','attendance.correct','staff.manage','services.manage','discounts.manage','sessions.edit')
    when 'reception' then _permission = 'pos.access'
    when 'accountant' then _permission = 'reports.view'
    when 'viewer' then _permission = 'reports.view'
    else false end
$$;
revoke all on function public.role_default_permission(public.company_role, text) from public;
grant execute on function public.role_default_permission(public.company_role, text) to pospay_app;

-- Session control functions --------------------------------------------------

create or replace function public.set_manager_pin(_company uuid, _pin text)
returns void
language plpgsql security definer set search_path = public, extensions, pg_catalog as $$
begin
  if not (public.has_company_role(_company, 'owner')
          or public.has_company_role(_company, 'branch_manager')) then
    raise exception 'FORBIDDEN';
  end if;
  if _pin is null or _pin !~ '^[0-9]{4}$' then raise exception 'INVALID_PIN'; end if;
  insert into public.manager_pins(company_id, user_id, pin_hash, updated_at)
  values (_company, public.current_app_user(), crypt(_pin, gen_salt('bf', 10)), now())
  on conflict (company_id, user_id)
  do update set pin_hash = excluded.pin_hash, updated_at = excluded.updated_at;
  insert into public.audit_log(company_id, actor_user_id, action, details)
  values (_company, public.current_app_user(), 'manager_pin.set', '{}'::jsonb);
end
$$;
revoke all on function public.set_manager_pin(uuid,text) from public;
grant execute on function public.set_manager_pin(uuid,text) to pospay_app;

create or replace function public.list_branch_approvers(_company uuid, _branch uuid)
returns table(user_id text, name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.session_writer(_company, _branch)
          or public.session_editor(_company, _branch)) then
    raise exception 'FORBIDDEN';
  end if;
  return query
    select m.user_id, coalesce(u.name, m.user_id)
    from public.memberships m
    join public."user" u on u.id = m.user_id
    where m.company_id = _company
      and public.discount_approver(_company, _branch, m.user_id)
      and exists (select 1 from public.manager_pins p
                  where p.company_id = _company and p.user_id = m.user_id)
    order by coalesce(u.name, m.user_id);
end
$$;
revoke all on function public.list_branch_approvers(uuid,uuid) from public;
grant execute on function public.list_branch_approvers(uuid,uuid) to pospay_app;

-- No lockout (Waleed 2026-11-19): a wrong PIN logs the attempt and returns
-- `invalid` without raising, so withUser() commits the attempt row.
create or replace function public.verify_manager_pin_approval(
  _company uuid, _branch uuid, _session_id uuid, _service_id uuid,
  _list_price_mills bigint, _price_mills bigint,
  _approver text, _pin text, _user_agent text)
returns table(status text, approval_id uuid)
language plpgsql security definer set search_path = public, extensions, pg_catalog as $$
declare
  v_hash text;
  v_approval uuid;
begin
  if not (public.session_writer(_company, _branch)
          or public.session_editor(_company, _branch)) then
    raise exception 'FORBIDDEN';
  end if;
  if not public.discount_approver(_company, _branch, _approver) then
    raise exception 'APPROVER_NOT_ALLOWED';
  end if;
  select p.pin_hash into v_hash
  from public.manager_pins p
  where p.company_id = _company and p.user_id = _approver;
  if v_hash is null then raise exception 'APPROVER_NOT_ALLOWED'; end if;
  if crypt(_pin, v_hash) <> v_hash then
    insert into public.manager_pin_attempts
      (company_id, branch_id, session_id, approver_user_id, requested_by, user_agent)
    values (_company, _branch, _session_id, _approver,
            public.current_app_user(), left(coalesce(_user_agent, ''), 200));
    insert into public.audit_log(company_id, actor_user_id, action, entity, entity_id, details)
    values (_company, public.current_app_user(), 'manager_pin.failed', 'discount_approval',
            _session_id::text, jsonb_build_object('approverUserId', _approver));
    return query select 'invalid'::text, null::uuid;
    return;
  end if;
  insert into public.discount_approvals
    (company_id, branch_id, session_id, service_id, list_price_mills,
     approved_price_mills, approver_user_id, requested_by, expires_at, source)
  values (_company, _branch, _session_id, _service_id, _list_price_mills,
          _price_mills, _approver, public.current_app_user(),
          now() + interval '5 minutes', 'pin')
  returning id into v_approval;
  return query select 'approved'::text, v_approval;
end
$$;
revoke all on function public.verify_manager_pin_approval(uuid,uuid,uuid,uuid,bigint,bigint,text,text,text) from public;
grant execute on function public.verify_manager_pin_approval(uuid,uuid,uuid,uuid,bigint,bigint,text,text,text) to pospay_app;

create or replace function public.consume_discount_approval(_company uuid, _approval_id uuid)
returns void
language plpgsql security definer set search_path = pg_catalog as $$
begin
  update public.discount_approvals a
  set consumed_at = now()
  where a.company_id = _company and a.id = _approval_id
    and a.consumed_at is null
    and a.requested_by = public.current_app_user()
    and exists (select 1 from public.service_sessions s
                where s.company_id = a.company_id and s.approval_id = a.id);
  if not found then raise exception 'FORBIDDEN'; end if;
end
$$;
revoke all on function public.consume_discount_approval(uuid,uuid) from public;
grant execute on function public.consume_discount_approval(uuid,uuid) to pospay_app;

create or replace function public.has_similar_session(
  _company uuid, _branch uuid, _service_id uuid, _staff_id uuid,
  _client_phone text, _occurred_at timestamptz, _exclude_id uuid default null)
returns boolean
language plpgsql stable security definer set search_path = pg_catalog as $$
begin
  if not public.session_writer(_company, _branch) then raise exception 'FORBIDDEN'; end if;
  return exists (
    select 1
    from public.service_sessions s
    join public.clients c on c.company_id = s.company_id and c.id = s.client_id
    where s.company_id = _company
      and s.service_id = _service_id and s.staff_id = _staff_id
      and c.phone = _client_phone
      and date_trunc('minute', s.occurred_at) = date_trunc('minute', _occurred_at)
      and (_exclude_id is null or s.id <> _exclude_id)
  );
end
$$;
revoke all on function public.has_similar_session(uuid,uuid,uuid,uuid,text,timestamptz,uuid) from public;
grant execute on function public.has_similar_session(uuid,uuid,uuid,uuid,text,timestamptz,uuid) to pospay_app;

create or replace function public.request_discount_approval(
  _company uuid, _branch uuid, _session_id uuid, _service_id uuid,
  _list_price_mills bigint, _price_mills bigint, _reason text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_request uuid;
begin
  if not (public.session_writer(_company, _branch)
          or public.session_editor(_company, _branch)) then
    raise exception 'FORBIDDEN';
  end if;
  if _price_mills is null or _list_price_mills is null
     or _price_mills < 0 or _price_mills >= _list_price_mills then
    raise exception 'INVALID_PRICE';
  end if;
  if _reason is null or length(trim(_reason)) = 0 or length(trim(_reason)) > 200 then
    raise exception 'DISCOUNT_REASON_REQUIRED';
  end if;
  update public.discount_approval_requests r
  set status = 'superseded'
  where r.company_id = _company and r.session_id = _session_id
    and r.requested_by = public.current_app_user() and r.status = 'pending';
  insert into public.discount_approval_requests
    (company_id, branch_id, session_id, service_id, list_price_mills,
     requested_price_mills, discount_reason, requested_by, expires_at)
  values (_company, _branch, _session_id, _service_id, _list_price_mills,
          _price_mills, trim(_reason), public.current_app_user(),
          now() + interval '5 minutes')
  returning id into v_request;
  insert into public.audit_log(company_id, actor_user_id, action, entity, entity_id, details)
  values (_company, public.current_app_user(), 'discount_approval.requested',
          'discount_approval_requests', v_request::text,
          jsonb_build_object('sessionId', _session_id, 'serviceId', _service_id));
  return v_request;
end
$$;
revoke all on function public.request_discount_approval(uuid,uuid,uuid,uuid,bigint,bigint,text) from public;
grant execute on function public.request_discount_approval(uuid,uuid,uuid,uuid,bigint,bigint,text) to pospay_app;

create or replace function public.decide_discount_approval(
  _company uuid, _request_id uuid, _approve boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_approval uuid;
begin
  if not public.is_member(_company) then raise exception 'FORBIDDEN'; end if;
  select * into r
  from public.discount_approval_requests q
  where q.company_id = _company and q.id = _request_id
  for update;
  if not found then raise exception 'FORBIDDEN'; end if;
  if not public.discount_approver(_company, r.branch_id, public.current_app_user()) then
    raise exception 'APPROVER_NOT_ALLOWED';
  end if;
  if r.status <> 'pending' or r.expires_at <= now() then
    raise exception 'APPROVAL_REQUEST_CLOSED';
  end if;
  if _approve then
    insert into public.discount_approvals
      (company_id, branch_id, session_id, service_id, list_price_mills,
       approved_price_mills, approver_user_id, requested_by, expires_at, source, request_id)
    values (_company, r.branch_id, r.session_id, r.service_id, r.list_price_mills,
            r.requested_price_mills, public.current_app_user(), r.requested_by,
            now() + interval '5 minutes', 'remote', r.id)
    returning id into v_approval;
    update public.discount_approval_requests q
    set status = 'approved', decided_by = public.current_app_user(),
        decided_at = now(), approval_id = v_approval
    where q.company_id = _company and q.id = _request_id;
    insert into public.audit_log(company_id, actor_user_id, action, entity, entity_id, details)
    values (_company, public.current_app_user(), 'discount_approval.approved',
            'discount_approval_requests', _request_id::text,
            jsonb_build_object('approvalId', v_approval));
  else
    update public.discount_approval_requests q
    set status = 'rejected', decided_by = public.current_app_user(), decided_at = now()
    where q.company_id = _company and q.id = _request_id;
    insert into public.audit_log(company_id, actor_user_id, action, entity, entity_id, details)
    values (_company, public.current_app_user(), 'discount_approval.rejected',
            'discount_approval_requests', _request_id::text, '{}'::jsonb);
  end if;
end
$$;
revoke all on function public.decide_discount_approval(uuid,uuid,boolean) from public;
grant execute on function public.decide_discount_approval(uuid,uuid,boolean) to pospay_app;

create or replace function public.list_pending_discount_approvals(_company uuid)
returns table(id uuid, branch_id uuid, branch_name text, service_name text,
              list_price_mills bigint, requested_price_mills bigint,
              discount_reason text, requester_name text,
              created_at timestamptz, expires_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_member(_company) then raise exception 'FORBIDDEN'; end if;
  return query
    select r.id, r.branch_id, b.name, sc.name,
           r.list_price_mills, r.requested_price_mills,
           r.discount_reason, u.name, r.created_at, r.expires_at
    from public.discount_approval_requests r
    join public.branches b on b.company_id = r.company_id and b.id = r.branch_id
    join public.service_catalog sc on sc.company_id = r.company_id and sc.id = r.service_id
    join public."user" u on u.id = r.requested_by
    where r.company_id = _company
      and r.status = 'pending' and r.expires_at > now()
      and public.discount_approver(r.company_id, r.branch_id, public.current_app_user())
    order by r.created_at;
end
$$;
revoke all on function public.list_pending_discount_approvals(uuid) from public;
grant execute on function public.list_pending_discount_approvals(uuid) to pospay_app;

create or replace function public.month_close_status(_company uuid, _period_month date)
returns integer
language plpgsql stable security definer set search_path = public as $$
declare v_days integer;
begin
  if not public.has_company_role(_company, 'owner') then raise exception 'FORBIDDEN'; end if;
  select greatest(coalesce(max(
    (_period_month + interval '1 month')::date
      - (now() at time zone b.timezone)::date), 0), 0)
  into v_days
  from public.branches b
  where b.company_id = _company;
  return v_days;
end
$$;
revoke all on function public.month_close_status(uuid,date) from public;
grant execute on function public.month_close_status(uuid,date) to pospay_app;

create or replace function public.list_editable_sessions(
  _company uuid, _from timestamptz, _until timestamptz, _limit integer)
returns table(id uuid, service_id uuid, service_name text, staff_id uuid,
              staff_name text, branch_id uuid, time_zone text, client_name text,
              client_phone_last3 text, occurred_at timestamptz, recorded_at timestamptz,
              list_price_mills bigint, price_mills bigint, discount_reason text,
              approved_by text, approver_name text, month_closed boolean,
              can_edit boolean, edit_count bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_member(_company) then raise exception 'FORBIDDEN'; end if;
  return query
    select s.id, s.service_id, s.service_name, s.staff_id, st.display_name,
           s.branch_id, b.timezone, c.name, right(c.phone, 3),
           s.occurred_at, s.recorded_at, s.list_price_mills, s.price_mills,
           s.discount_reason, s.approved_by, au.name,
           public.is_month_closed(s.company_id, s.branch_id, s.occurred_at),
           not public.is_month_closed(s.company_id, s.branch_id, s.occurred_at),
           (select count(*) from public.service_session_edits e
            where e.company_id = s.company_id and e.session_id = s.id)
    from public.service_sessions s
    join public.branches b on b.company_id = s.company_id and b.id = s.branch_id
    join public.staff_members st on st.company_id = s.company_id and st.id = s.staff_id
    join public.clients c on c.company_id = s.company_id and c.id = s.client_id
    left join public."user" au on au.id = s.approved_by
    where s.company_id = _company
      and s.occurred_at >= _from and s.occurred_at <= _until
      and public.session_editor(s.company_id, s.branch_id)
    order by s.occurred_at desc
    limit greatest(coalesce(_limit, 50), 1);
end
$$;
revoke all on function public.list_editable_sessions(uuid,timestamptz,timestamptz,int) from public;
grant execute on function public.list_editable_sessions(uuid,timestamptz,timestamptz,int) to pospay_app;

-- One session by id for the edit path. Reuses list_editable_sessions at the
-- session's own instant so the row shape and editor gate stay in one place.
create or replace function public.editable_session_by_id(_company uuid, _session_id uuid)
returns table(id uuid, service_id uuid, service_name text, staff_id uuid,
              staff_name text, branch_id uuid, time_zone text, client_name text,
              client_phone_last3 text, occurred_at timestamptz, recorded_at timestamptz,
              list_price_mills bigint, price_mills bigint, discount_reason text,
              approved_by text, approver_name text, month_closed boolean,
              can_edit boolean, edit_count bigint)
language plpgsql stable security definer set search_path = public as $$
declare v_at timestamptz;
begin
  if not public.is_member(_company) then raise exception 'FORBIDDEN'; end if;
  select s.occurred_at into v_at from public.service_sessions s
  where s.company_id = _company and s.id = _session_id;
  if v_at is null then return; end if;
  return query
    select l.* from public.list_editable_sessions(_company, v_at, v_at, 100000) l
    where l.id = _session_id;
end
$$;
revoke all on function public.editable_session_by_id(uuid,uuid) from public;
grant execute on function public.editable_session_by_id(uuid,uuid) to pospay_app;

-- Display names of the caller's fellow members (no email). pospay_app cannot
-- read public."user", so approver names for non-staff members come from here.
create or replace function public.company_member_names(_company uuid)
returns table(user_id text, name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_member(_company) then raise exception 'FORBIDDEN'; end if;
  return query
    select distinct on (m.user_id) m.user_id, coalesce(sm.display_name, u.name)
    from public.memberships m
    join public."user" u on u.id = m.user_id
    left join public.staff_members sm
      on sm.company_id = m.company_id and sm.user_id = m.user_id
    where m.company_id = _company
    order by m.user_id, sm.id;
end
$$;
revoke all on function public.company_member_names(uuid) from public;
grant execute on function public.company_member_names(uuid) to pospay_app;

-- Atomic audited edit (Rule D4); pospay_app has no raw UPDATE grant.
create or replace function public.update_recorded_session(
  _company uuid, _session_id uuid, _service_id uuid, _staff_id uuid,
  _client_name text, _client_phone text, _occurred_at timestamptz,
  _price_mills bigint, _discount_reason text, _approval_id uuid, _edit_reason text)
returns void
language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_old record;
  v_branch uuid;
  v_list_price bigint;
  v_service_name text;
  v_approved_by text;
  v_approved_at timestamptz;
  v_approval uuid;
  v_over_limit boolean;
  v_client_id uuid;
  v_old_client record;
  v_before jsonb;
  v_after jsonb;
begin
  if _edit_reason is null or length(trim(_edit_reason)) = 0
     or length(trim(_edit_reason)) > 200 then
    raise exception 'EDIT_REASON_REQUIRED';
  end if;
  select s.* into v_old
  from public.service_sessions s
  where s.company_id = _company and s.id = _session_id
  for update;
  if not found then raise exception 'FORBIDDEN'; end if;
  if not public.session_editor(_company, v_old.branch_id) then
    raise exception 'FORBIDDEN';
  end if;
  select sm.branch_id into v_branch
  from public.staff_members sm
  where sm.company_id = _company and sm.id = _staff_id;
  if v_branch is null then raise exception 'NOT_ASSIGNED'; end if;
  if not public.session_editor(_company, v_branch) then
    raise exception 'FORBIDDEN';
  end if;
  if public.is_month_closed(_company, v_old.branch_id, v_old.occurred_at)
     or public.is_month_closed(_company, v_branch, _occurred_at) then
    raise exception 'PERIOD_CLOSED';
  end if;
  if _price_mills is null or _price_mills < 0 then raise exception 'INVALID_PRICE'; end if;
  if _service_id = v_old.service_id then
    v_list_price := v_old.list_price_mills;
    v_service_name := v_old.service_name;
  else
    select c.price_mills, c.name into v_list_price, v_service_name
    from public.service_catalog c
    where c.company_id = _company and c.id = _service_id;
    if not found then raise exception 'NOT_ASSIGNED'; end if;
  end if;
  if not exists (select 1 from public.service_assignments a
                 where a.company_id = _company and a.service_id = _service_id
                   and a.staff_id = _staff_id and a.active) then
    raise exception 'NOT_ASSIGNED';
  end if;
  v_over_limit := not public.discount_within_cap(_company, v_list_price, _price_mills);
  if _price_mills <> v_list_price
     and length(trim(coalesce(_discount_reason, ''))) = 0 then
    raise exception 'DISCOUNT_REASON_REQUIRED';
  end if;
  if _approval_id is not null then
    select a.approver_user_id, a.created_at into v_approved_by, v_approved_at
    from public.discount_approvals a
    where a.company_id = _company and a.id = _approval_id
      and a.branch_id = v_branch and a.session_id = _session_id
      and a.service_id = _service_id and a.list_price_mills = v_list_price
      and a.approved_price_mills = _price_mills
      and a.consumed_at is null and a.expires_at > now()
      and a.requested_by = public.current_app_user()
      and public.discount_approver(_company, v_branch, a.approver_user_id);
    if not found then raise exception 'DISCOUNT_OVER_LIMIT'; end if;
    v_approval := _approval_id;
  elsif v_over_limit then
    -- A kept approval is valid only while service, price and branch are unchanged.
    if _service_id = v_old.service_id and _price_mills = v_old.price_mills
       and v_branch = v_old.branch_id and v_old.approval_id is not null
       and v_old.approved_by is not null and v_old.approved_at is not null then
      v_approved_by := v_old.approved_by;
      v_approved_at := v_old.approved_at;
      v_approval := v_old.approval_id;
    else
      raise exception 'DISCOUNT_OVER_LIMIT';
    end if;
  else
    v_approved_by := null;
    v_approved_at := null;
    v_approval := null;
  end if;
  select c.* into v_old_client
  from public.clients c
  where c.company_id = _company and c.id = v_old.client_id;
  if _client_phone is null then
    if v_old_client.id is null
       or trim(coalesce(_client_name, '')) is distinct from trim(v_old_client.name) then
      raise exception 'CLIENT_PHONE_REQUIRED';
    end if;
    v_client_id := v_old.client_id;
  else
    if _client_phone !~ '^[0-9]{8,15}$' then raise exception 'CLIENT_PHONE_REQUIRED'; end if;
    insert into public.clients(company_id, name, phone)
    values (_company, _client_name, _client_phone)
    on conflict (company_id, phone) do update set name = excluded.name
    returning id into v_client_id;
  end if;
  v_before := jsonb_build_object(
    'sessionId', v_old.id, 'serviceId', v_old.service_id, 'serviceName', v_old.service_name,
    'staffId', v_old.staff_id, 'branchId', v_old.branch_id,
    'clientId', v_old.client_id, 'clientName', v_old_client.name,
    'clientPhoneLast3', right(v_old_client.phone, 3),
    'occurredAt', v_old.occurred_at, 'listPriceMills', v_old.list_price_mills,
    'priceMills', v_old.price_mills, 'discountReason', v_old.discount_reason,
    'approvedBy', v_old.approved_by);
  update public.service_sessions s set
    service_id = _service_id,
    service_name = v_service_name,
    staff_id = _staff_id,
    branch_id = v_branch,
    client_id = v_client_id,
    occurred_at = _occurred_at,
    list_price_mills = v_list_price,
    price_mills = _price_mills,
    discount_reason = nullif(trim(coalesce(_discount_reason, '')), ''),
    approved_by = v_approved_by,
    approved_at = v_approved_at,
    approval_id = v_approval,
    updated_at = now(),
    updated_by = public.current_app_user()
  where s.company_id = _company and s.id = _session_id;
  if _approval_id is not null then
    update public.discount_approvals a
    set consumed_at = now()
    where a.company_id = _company and a.id = _approval_id and a.consumed_at is null;
  end if;
  v_after := jsonb_build_object(
    'sessionId', _session_id, 'serviceId', _service_id, 'serviceName', v_service_name,
    'staffId', _staff_id, 'branchId', v_branch,
    'clientId', v_client_id, 'clientName', _client_name,
    'clientPhoneLast3', right(coalesce(_client_phone, v_old_client.phone), 3),
    'occurredAt', _occurred_at, 'listPriceMills', v_list_price,
    'priceMills', _price_mills, 'discountReason', nullif(trim(coalesce(_discount_reason, '')), ''),
    'approvedBy', v_approved_by);
  insert into public.service_session_edits
    (company_id, session_id, edited_by, edit_reason, before_snapshot, after_snapshot)
  values (_company, _session_id, public.current_app_user(), trim(_edit_reason),
          v_before, v_after);
  insert into public.audit_log(company_id, actor_user_id, action, entity, entity_id, details)
  values (_company, public.current_app_user(), 'session.edited', 'service_sessions',
          _session_id::text,
          jsonb_build_object('editReason', trim(_edit_reason),
                             'approvalKept', v_approval is not null and v_approval = v_old.approval_id));
end
$$;
revoke all on function public.update_recorded_session(uuid,uuid,uuid,uuid,text,text,timestamptz,bigint,text,uuid,text) from public;
grant execute on function public.update_recorded_session(uuid,uuid,uuid,uuid,text,text,timestamptz,bigint,text,uuid,text) to pospay_app;

-- Updated insert policy (Spec 020): every 0014 predicate except the price
-- ceiling, plus closed-month block, no-edit columns, approval columns all-null
-- or backed by valid_discount_approval, and the new price floor.
drop policy if exists sessions_insert on public.service_sessions;
create policy sessions_insert on public.service_sessions
  for insert to pospay_app with check (
    public.session_writer(company_id, branch_id)
    and recorded_by = public.current_app_user()
    and client_id is not null
    and list_price_mills = (select c.price_mills from public.service_catalog c
                            where c.company_id = service_sessions.company_id
                              and c.id = service_sessions.service_id)
    and (price_mills = list_price_mills or length(trim(coalesce(discount_reason,''))) > 0)
    and not public.is_month_closed(company_id, branch_id, occurred_at)
    and updated_at is null and updated_by is null
    and ((approved_by is null and approved_at is null and approval_id is null)
         or (approved_by is not null and approved_at is not null and approval_id is not null
             and public.valid_discount_approval(company_id, approval_id, branch_id, id,
                   service_id, list_price_mills, price_mills, approved_by, approved_at)))
    and (public.discount_within_cap(company_id, list_price_mills, price_mills)
         or approval_id is not null)
  );
