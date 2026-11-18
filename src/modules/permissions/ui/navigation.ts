import {
  CalendarCheck,
  ChartBar,
  ClipboardText,
  DeviceMobile,
  GearSix,
  House,
  IdentificationCard,
  PencilSimpleLine,
  Percent,
  Plug,
  QrCode,
  Question,
  Scan,
  Sparkle,
  Stethoscope,
  Storefront,
  Timer,
  UserPlus,
  UsersThree,
  type Icon,
} from "@phosphor-icons/react";
import type { MessageKey } from "@/i18n";
import type { Area, PermissionKey } from "../contracts";

export interface NavLeaf {
  to: string;
  label: MessageKey;
  icon: Icon;
  requires?: PermissionKey;
  needsRecording?: boolean;
}
export interface NavGroup {
  label: MessageKey;
  icon: Icon;
  to?: string;
  requires?: PermissionKey;
  children?: NavLeaf[];
}

const NAV: Record<Area, NavGroup[]> = {
  admin: [
    { to: "/admin", label: "nav.dashboard", icon: House },
    { to: "/admin/connectors", label: "nav.connectors", icon: Plug },
    { to: "/admin/diagnose", label: "nav.diagnose", icon: Stethoscope },
    { to: "/admin/settings", label: "nav.settings", icon: GearSix },
  ],
  app: [
    { to: "/app", label: "nav.dashboard", icon: House },
    {
      label: "nav.group.attendance",
      icon: CalendarCheck,
      children: [
        {
          to: "/app/attendance/reports",
          label: "nav.reports",
          icon: ChartBar,
          requires: "reports.view",
        },
        {
          to: "/app/attendance/corrections",
          label: "nav.corrections",
          icon: PencilSimpleLine,
          requires: "attendance.correct",
        },
        {
          to: "/app/attendance/questions",
          label: "nav.insights",
          icon: Question,
          requires: "reports.view",
        },
      ],
    },
    {
      label: "nav.group.staff",
      icon: UsersThree,
      children: [
        {
          to: "/app/staff/cards",
          label: "nav.cards",
          icon: IdentificationCard,
          requires: "staff.manage",
        },
        {
          to: "/app/staff/phones",
          label: "nav.phones",
          icon: DeviceMobile,
          requires: "staff.manage",
        },
        { to: "/app/staff/team", label: "nav.team", icon: UserPlus, requires: "staff.manage" },
      ],
    },
    {
      label: "nav.group.services",
      icon: Sparkle,
      children: [
        { to: "/app/services", label: "nav.services", icon: Sparkle, requires: "services.manage" },
        {
          to: "/app/services/discounts",
          label: "nav.discounts",
          icon: Percent,
          requires: "discounts.manage",
        },
      ],
    },
    { to: "/pos", label: "nav.openReception", icon: Storefront, requires: "pos.access" },
    { to: "/app/settings", label: "nav.settings", icon: GearSix },
  ],
  pos: [
    { to: "/pos", label: "nav.receptionHome", icon: House },
    { to: "/pos/qr", label: "nav.reception", icon: QrCode },
    { to: "/pos/cards", label: "nav.cardScan", icon: Scan },
    {
      label: "nav.group.sessions",
      icon: Timer,
      children: [
        { to: "/pos/sessions", label: "nav.sessions", icon: ClipboardText, needsRecording: true },
      ],
    },
    { to: "/pos/settings", label: "nav.settings", icon: GearSix },
  ],
  me: [
    { to: "/me", label: "nav.myDashboard", icon: House },
    { to: "/me/attend", label: "nav.attend", icon: CalendarCheck },
    { to: "/me/phone", label: "nav.phone", icon: DeviceMobile },
    { to: "/me/settings", label: "nav.settings", icon: GearSix },
  ],
};

const allowed = (
  item: { requires?: PermissionKey; needsRecording?: boolean },
  perms: readonly PermissionKey[],
  recording: boolean,
) => (!item.requires || perms.includes(item.requires)) && (!item.needsRecording || recording);

/** يرشّح القائمة حسب الصلاحيات وإتاحة تسجيل الجلسات. */
export function visibleNavigation(
  area: Area,
  perms: readonly PermissionKey[],
  recording: boolean,
): NavGroup[] {
  return NAV[area].flatMap((group) => {
    if (!group.children) return allowed(group, perms, recording) ? [group] : [];
    const children = group.children.filter((c) => allowed(c, perms, recording));
    return children.length ? [{ ...group, children }] : [];
  });
}

export interface NavTab {
  to: string;
  label: MessageKey;
  icon: Icon;
  active: boolean;
}

const TAB_COUNT = 4;

/** أول أقسام القائمة كتبويبات للهاتف؛ القسم اللي له فروع يفتح أول فرع فيه ويتظلل مع أي فرع منه. */
export function tabNavigation(groups: NavGroup[], pathname: string): NavTab[] {
  return groups.slice(0, TAB_COUNT).flatMap((group) => {
    const to = group.to ?? group.children?.[0]?.to;
    if (!to) return [];
    const active = group.children
      ? group.children.some((child) => child.to === pathname)
      : to === pathname;
    return [{ to, label: group.label, icon: group.icon, active }];
  });
}
