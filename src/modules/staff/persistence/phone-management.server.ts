import type pg from "pg";
import type { PhoneManagementDto, PhoneStaffOption } from "../phone.contracts";

export async function readPhoneManagement(
  db: pg.PoolClient,
  userId: string,
  companyId: string,
): Promise<PhoneManagementDto> {
  const { rows } = await db.query<{
    member: boolean;
    canBind: boolean;
    isBound: boolean;
    canManage: boolean;
  }>(
    `select public.is_member($1) as member,
    (public.my_staff_id($1) is not null and not exists (
      select 1 from public.permission_overrides where company_id=$1 and user_id=$2
      and permission='attendance.record' and effect='deny')) as "canBind",
    exists (select 1 from public.phone_bindings where company_id=$1 and user_id=$2) as "isBound",
    (public.is_company_admin($1) and not exists (
      select 1 from public.permission_overrides where company_id=$1 and user_id=$2
      and permission='attendance.manage_devices' and effect='deny')) as "canManage"`,
    [companyId, userId],
  );
  const access = rows[0];
  if (!access?.member) throw new Error("FORBIDDEN");
  if (!access.canManage) {
    return { canBind: access.canBind, isBound: access.isBound, canManage: false, staff: [] };
  }
  const staff = await db.query<PhoneStaffOption>(
    `select s.user_id as "userId",
    s.display_name as "displayName", b.name as "branchName",
    exists (select 1 from public.phone_bindings p
      where p.company_id=s.company_id and p.user_id=s.user_id) as "isBound"
    from public.staff_members s join public.branches b
      on b.company_id=s.company_id and b.id=s.branch_id
    where s.company_id=$1 and s.user_id is not null
    order by s.display_name,s.id`,
    [companyId],
  );
  return { canBind: access.canBind, isBound: access.isBound, canManage: true, staff: staff.rows };
}
