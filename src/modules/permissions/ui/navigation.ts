import type { MessageKey } from "@/i18n";
import type { Area, PermissionKey } from "../contracts";

export interface NavLeaf {
  to: string;
  label: MessageKey;
  icon: string;
  requires?: PermissionKey;
  needsRecording?: boolean;
}
export interface NavGroup {
  label: MessageKey;
  icon: string;
  to?: string;
  requires?: PermissionKey;
  children?: NavLeaf[];
}

const NAV: Record<Area, NavGroup[]> = {
  admin: [
    { to: "/admin", label: "nav.dashboard", icon: "⌂" },
    { to: "/admin/connectors", label: "nav.connectors", icon: "⚙" },
    { to: "/admin/diagnose", label: "nav.diagnose", icon: "✚" },
    { to: "/admin/settings", label: "nav.settings", icon: "◐" },
  ],
  app: [
    { to: "/app", label: "nav.dashboard", icon: "⌂" },
    {
      label: "nav.group.attendance",
      icon: "✓",
      children: [
        {
          to: "/app/attendance/reports",
          label: "nav.reports",
          icon: "≡",
          requires: "reports.view",
        },
        {
          to: "/app/attendance/corrections",
          label: "nav.corrections",
          icon: "✓",
          requires: "attendance.correct",
        },
        {
          to: "/app/attendance/questions",
          label: "nav.insights",
          icon: "?",
          requires: "reports.view",
        },
      ],
    },
    {
      label: "nav.group.staff",
      icon: "▤",
      children: [
        { to: "/app/staff/cards", label: "nav.cards", icon: "▤", requires: "staff.manage" },
        { to: "/app/staff/phones", label: "nav.phones", icon: "▢", requires: "staff.manage" },
        { to: "/app/staff/team", label: "nav.team", icon: "+", requires: "staff.manage" },
      ],
    },
    {
      label: "nav.group.services",
      icon: "◇",
      children: [
        { to: "/app/services", label: "nav.services", icon: "◇", requires: "services.manage" },
        {
          to: "/app/services/discounts",
          label: "nav.discounts",
          icon: "%",
          requires: "discounts.manage",
        },
      ],
    },
    { to: "/pos", label: "nav.openReception", icon: "▦", requires: "pos.access" },
    { to: "/app/settings", label: "nav.settings", icon: "◐" },
  ],
  pos: [
    { to: "/pos", label: "nav.receptionHome", icon: "⌂" },
    { to: "/pos/qr", label: "nav.reception", icon: "▦" },
    { to: "/pos/cards", label: "nav.cardScan", icon: "▥" },
    {
      label: "nav.group.sessions",
      icon: "◆",
      children: [{ to: "/pos/sessions", label: "nav.sessions", icon: "◆", needsRecording: true }],
    },
    { to: "/pos/settings", label: "nav.settings", icon: "◐" },
  ],
  me: [
    { to: "/me", label: "nav.myDashboard", icon: "⌂" },
    { to: "/me/attend", label: "nav.attend", icon: "✓" },
    { to: "/me/phone", label: "nav.phone", icon: "▢" },
    { to: "/me/settings", label: "nav.settings", icon: "◐" },
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
