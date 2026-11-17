-- 001 attendance: staff profiles, shifts, attendance records (D-12, D-32, D-53).
alter table public.branches add column if not exists qr_secret text not null
  default encode(gen_random_bytes(32), 'hex');
revoke select on public.branches from pospay_app;
grant select (id, company_id, name, timezone, latitude, longitude, geofence_meters, created_at)
  on public.branches to pospay_app;

create table if not exists public.staff_members (
  company_id uuid not null references public.companies(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  user_id text,
  display_name text not null,
  created_at timestamptz not null default now(),
  primary key (company_id, id),
  unique (company_id, user_id)
);

create table if not exists public.shifts (
  company_id uuid not null references public.companies(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  staff_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  primary key (company_id, id),
  foreign key (company_id, staff_id) references public.staff_members(company_id, id) on delete cascade
);
create index if not exists shifts_staff_start on public.shifts (company_id, staff_id, starts_at);

do $$ begin
  create type public.attendance_status as enum ('open','ok','closed_late','forgotten');
exception when duplicate_object then null; end $$;

create table if not exists public.attendance_records (
  company_id uuid not null references public.companies(id) on delete cascade,
  id uuid not null,
  staff_id uuid not null,
  branch_id uuid not null references public.branches(id),
  shift_id uuid,
  work_date date not null,
  check_in_at timestamptz not null,
  check_out_at timestamptz,
  status public.attendance_status not null default 'open',
  late_minutes integer not null default 0,
  check_in_exception text check (check_in_exception in ('no_location','outside_geofence')),
  check_out_exception text check (check_out_exception in ('no_location','outside_geofence')),
  corrected_check_out_at timestamptz,
  correction_reason text,
  corrected_by text,
  previous_check_out_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (company_id, id),
  foreign key (company_id, staff_id) references public.staff_members(company_id, id) on delete cascade,
  check ((corrected_check_out_at is null) = (correction_reason is null))
);
create unique index if not exists one_open_record_per_staff
  on public.attendance_records (company_id, staff_id) where status = 'open';

create or replace function public.my_staff_id(_company uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.staff_members
   where company_id = _company and user_id = public.current_app_user()
$$;

create or replace function public.is_company_admin(_company uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_company_role(_company, 'owner') or public.has_company_role(_company, 'branch_manager')
$$;

-- Branch QR secret: only staff of the company (or reception/admins) can sign or verify through this.
create or replace function public.branch_qr_secret(_branch uuid) returns text
language sql stable security definer set search_path = public as $$
  select b.qr_secret from public.branches b where b.id = _branch and public.is_member(b.company_id)
$$;

grant select, insert, update on public.staff_members, public.shifts, public.attendance_records to pospay_app;
grant delete on public.shifts to pospay_app;
grant execute on function public.my_staff_id(uuid), public.is_company_admin(uuid),
  public.branch_qr_secret(uuid) to pospay_app;

alter table public.staff_members enable row level security;
alter table public.shifts enable row level security;
alter table public.attendance_records enable row level security;

drop policy if exists staff_read on public.staff_members;
create policy staff_read on public.staff_members for select to pospay_app
  using (public.is_member(company_id));
drop policy if exists staff_admin_write on public.staff_members;
create policy staff_admin_write on public.staff_members for all to pospay_app
  using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id));

drop policy if exists shifts_read on public.shifts;
create policy shifts_read on public.shifts for select to pospay_app
  using (public.is_company_admin(company_id) or staff_id = public.my_staff_id(company_id));
drop policy if exists shifts_admin_write on public.shifts;
create policy shifts_admin_write on public.shifts for all to pospay_app
  using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id));

drop policy if exists attendance_read on public.attendance_records;
create policy attendance_read on public.attendance_records for select to pospay_app
  using (public.is_company_admin(company_id) or staff_id = public.my_staff_id(company_id));
drop policy if exists attendance_own_insert on public.attendance_records;
create policy attendance_own_insert on public.attendance_records for insert to pospay_app
  with check (staff_id = public.my_staff_id(company_id));
drop policy if exists attendance_own_or_admin_update on public.attendance_records;
create policy attendance_own_or_admin_update on public.attendance_records for update to pospay_app
  using (public.is_company_admin(company_id) or staff_id = public.my_staff_id(company_id))
  with check (public.is_company_admin(company_id) or staff_id = public.my_staff_id(company_id));
