-- Require branch references to stay within the company. Validation fails if
-- existing records need operator-approved reconciliation.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.branches'::regclass and conname = 'branches_company_id_id_key'
  ) then
    alter table public.branches add constraint branches_company_id_id_key unique (company_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.staff_members'::regclass and conname = 'staff_members_company_branch_fkey'
  ) then
    alter table public.staff_members add constraint staff_members_company_branch_fkey
      foreign key (company_id, branch_id) references public.branches(company_id, id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.attendance_records'::regclass and conname = 'attendance_records_company_branch_fkey'
  ) then
    alter table public.attendance_records add constraint attendance_records_company_branch_fkey
      foreign key (company_id, branch_id) references public.branches(company_id, id);
  end if;
end $$;
