import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { t, type MessageKey } from "@/i18n";

interface NavItem {
  to: "/" | "/reception/qr" | "/phone" | "/attendance-questions" | "/sign-in" | "/admin/connectors";
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
      { to: "/attendance-questions", label: "nav.insights", icon: "?" },
    ],
  },
  {
    title: "nav.section.platform",
    items: [{ to: "/admin/connectors", label: "nav.connectors", icon: "⚙" }],
  },
  { title: "nav.section.account", items: [{ to: "/sign-in", label: "nav.signIn", icon: "→" }] },
];

export interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-56 shrink-0 border-e border-sidebar-border bg-sidebar md:block">
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
        <nav className="flex gap-1 overflow-x-auto border-b border-border bg-sidebar px-2 py-2 md:hidden">
          {sections
            .flatMap((s) => s.items)
            .map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: true }}
                className="shrink-0 rounded-md px-2 py-1 text-xs text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring data-[status=active]:bg-sidebar-accent data-[status=active]:font-medium data-[status=active]:text-sidebar-foreground"
              >
                {t(item.label)}
              </Link>
            ))}
        </nav>
        <main>{children}</main>
      </div>
    </div>
  );
}
