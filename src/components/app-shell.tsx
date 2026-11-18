import { Link } from "@tanstack/react-router";
import type { FileRoutesByTo } from "@/routeTree.gen";
import { useEffect, useRef, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { t, type MessageKey } from "@/i18n";
import { serviceSessionRecordingAvailable } from "@/modules/services";

interface NavItem {
  to: keyof FileRoutesByTo;
  label: MessageKey;
  icon: string;
}

const sections: { title: MessageKey | null; items: NavItem[] }[] = [
  { title: null, items: [{ to: "/", label: "nav.home", icon: "⌂" }] },
  {
    title: "nav.section.attendance",
    items: [
      { to: "/reception/qr", label: "nav.reception", icon: "▦" },
      { to: "/phone", label: "nav.phone", icon: "▢" },
      { to: "/cards", label: "nav.cards", icon: "▤" },
      { to: "/reception/cards", label: "nav.cardScan", icon: "▥" },
      { to: "/services", label: "nav.services", icon: "◇" },
      ...(serviceSessionRecordingAvailable
        ? [{ to: "/sessions", label: "nav.sessions", icon: "◆" } as const]
        : []),
      { to: "/discounts", label: "nav.discounts", icon: "%" },
      { to: "/reports", label: "nav.reports", icon: "≡" },
      { to: "/attendance-corrections", label: "nav.corrections", icon: "✓" },
      { to: "/attendance-questions", label: "nav.insights", icon: "?" },
    ],
  },
  {
    title: "nav.section.platform",
    items: [
      { to: "/admin/connectors", label: "nav.connectors", icon: "⚙" },
      { to: "/admin/diagnose", label: "nav.diagnose", icon: "✚" },
    ],
  },
  { title: "nav.section.settings", items: [{ to: "/settings", label: "nav.settings", icon: "◐" }] },
  { title: "nav.section.account", items: [{ to: "/sign-in", label: "nav.signIn", icon: "→" }] },
];

export interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const mobileNav = useRef<HTMLElement>(null);
  useEffect(() => {
    mobileNav.current
      ?.querySelector('[data-status="active"]')
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);
  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      <aside className="sticky top-0 hidden h-dvh w-52 shrink-0 overflow-y-auto border-e border-sidebar-border bg-sidebar md:block lg:w-60">
        <div className="px-4 py-4 text-sm font-bold">{t("app.name")}</div>
        <nav className="flex flex-col gap-4 px-2 pb-4">
          {sections.map((s, i) => (
            <div
              key={i}
              className="flex flex-col gap-0.5 border-t border-sidebar-border pt-3 first:border-t-0 first:pt-0"
            >
              {s.title && (
                <div className="px-2 pb-1 text-xs font-medium text-muted-foreground">
                  {t(s.title)}
                </div>
              )}
              {s.items.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  activeOptions={{ exact: true }}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-2 focus-visible:outline-ring data-[status=active]:bg-sidebar-accent data-[status=active]:font-medium data-[status=active]:text-sidebar-foreground"
                >
                  <span aria-hidden className="w-4 text-center">
                    {item.icon}
                  </span>
                  {t(item.label)}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        <nav
          ref={mobileNav}
          className="sticky top-0 z-10 flex gap-1 overflow-x-auto border-b border-border bg-sidebar/95 px-2 py-1.5 backdrop-blur md:hidden"
        >
          {sections
            .flatMap((s) => s.items)
            .map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: true }}
                className="inline-flex min-h-11 shrink-0 items-center rounded-md px-3 text-sm text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring data-[status=active]:bg-sidebar-accent data-[status=active]:font-medium data-[status=active]:text-sidebar-foreground"
              >
                {t(item.label)}
              </Link>
            ))}
        </nav>
        <main className="pb-[env(safe-area-inset-bottom)]">{children}</main>
      </div>
    </div>
  );
}
