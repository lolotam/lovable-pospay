import type pg from "pg";
import type { PhoneManagementDto, PhoneStaffOption } from "../phone.contracts";

/**
 * من يدير أجهزة الموظفين في الشركة $1: مدير بصلاحية staff.manage بلا منع attendance.manage_devices.
 * المالك لا يتأثر بأي تجاوز (D-31)، كسياسة phone_unbind في 0019.
 */
const CAN_MANAGE_DEVICES = `(public.is_company_admin($1) and public.has_permission($1, 'staff.manage')
  and (public.has_company_role($1, 'owner') or not exists (
    select 1 from public.permission_overrides where company_id=$1 and user_id=public.current_app_user()
    and permission='attendance.manage_devices' and effect='deny')))`;

export async function requireDeviceManager(db: pg.PoolClient, companyId: string): Promise<void> {
  const { rows } = await db.query<{ allowed: boolean }>(`select ${CAN_MANAGE_DEVICES} as allowed`, [
    companyId,
  ]);
  if (rows[0]?.allowed !== true) throw new Error("FORBIDDEN");
}

export async function readPhoneManagement(
  db: pg.PoolClient,
  userId: string,
  companyId: string,
  deviceHash: string | null = null,
): Promise<PhoneManagementDto> {
  const { rows } = await db.query<{
    member: boolean;
    canBind: boolean;
    isBound: boolean;
    browserBinding: PhoneManagementDto["browserBinding"];
    canManage: boolean;
  }>(
    `select public.is_member($1) as member,
    (public.my_staff_id($1) is not null and not exists (
      select 1 from public.permission_overrides where company_id=$1 and user_id=$2
      and permission='attendance.record' and effect='deny')) as "canBind",
    exists (select 1 from public.phone_bindings where company_id=$1 and user_id=$2) as "isBound",
    (select json_build_object('companyId', c.id, 'companyName', c.name)
      from public.phone_bindings p join public.companies c on c.id=p.company_id
      where p.user_id=$2 and p.device_hash=$3) as "browserBinding",
    ${CAN_MANAGE_DEVICES} as "canManage"`,
    [companyId, userId, deviceHash],
  );
  const access = rows[0];
  if (!access?.member) throw new Error("FORBIDDEN");
  const ownBinding = {
    canBind: access.canBind && !access.browserBinding,
    isBound: access.isBound,
    browserBinding: access.browserBinding,
  };
  if (!access.canManage) {
    return { ...ownBinding, canManage: false, staff: [] };
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
  return { ...ownBinding, canManage: true, staff: staff.rows };
}
