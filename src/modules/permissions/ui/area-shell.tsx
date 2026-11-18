import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronDown, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { serviceSessionRecordingAvailable } from "@/modules/services";
import type { Area, SessionContextDto } from "../contracts";
import { visibleNavigation, type NavGroup, type NavLeaf } from "./navigation";
import { WorkspaceSwitcher, workspaceLabel } from "./workspace-switcher";
import { UserMenu } from "./user-menu";
import { ActiveCompanyProvider } from "@/lib/active-company";

export interface AreaShellProps {
  area: Area;
  context: SessionContextDto;
  children: ReactNode;
}

function NavigationLeaf({ item, close }: { item: NavLeaf; close: () => void }) {
  return (
    <Link
      to={item.to}
      onClick={close}
      activeOptions={{ exact: true }}
      className="flex min-h-11 items-center gap-2 rounded-md px-3 text-sm text-muted-foreground hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-ring data-[status=active]:bg-sidebar-accent data-[status=active]:text-sidebar-foreground"
    >
      <span aria-hidden className="w-4 shrink-0 text-center">
        {item.icon}
      </span>
      <span className="break-words">{t(item.label)}</span>
    </Link>
  );
}

function NavigationGroup({
  group,
  close,
  pathname,
}: {
  group: NavGroup;
  close: () => void;
  pathname: string;
}) {
  const active = group.children?.some((child) => child.to === pathname) ?? false;
  const [open, setOpen] = useState(active);
  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);
  if (group.to) return <NavigationLeaf item={{ ...group, to: group.to }} close={close} />;
  return (
    <div>
      <Button
        variant="ghost"
        className="min-h-11 w-full justify-between text-muted-foreground"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="flex items-center gap-2">
          <span aria-hidden>{group.icon}</span>
          {t(group.label)}
        </span>
        <ChevronDown className={`size-4 ${open ? "rotate-180" : ""}`} />
      </Button>
      {open && (
        <div className="ms-4 border-s border-sidebar-border ps-1">
          {group.children?.map((item) => (
            <NavigationLeaf key={item.to} item={item} close={close} />
          ))}
        </div>
      )}
    </div>
  );
}

function SidebarContents({
  area,
  context,
  close,
}: Omit<AreaShellProps, "children"> & { close: () => void }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-sidebar-border px-3 py-4">
        <Link to="/" className="px-2 text-lg font-bold">
          {t("app.name")}
        </Link>
        <div className="mt-3">
          <WorkspaceSwitcher context={context} />
        </div>
      </div>
      <nav
        aria-label={t("nav.menu")}
        className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-4"
      >
        {visibleNavigation(area, context.permissions, serviceSessionRecordingAvailable).map(
          (group) => (
            <NavigationGroup key={group.label} group={group} close={close} pathname={pathname} />
          ),
        )}
      </nav>
      <UserMenu user={context.user} />
    </div>
  );
}

export function AreaShell({ area, context, children }: AreaShellProps) {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  useEffect(() => setOpen(false), [pathname, context.active]);
  const activeCompany = context.active?.kind === "company" ? context.active.companyId : null;
  return (
    <ActiveCompanyProvider value={activeCompany}>
      <div className="flex min-h-dvh bg-background text-foreground">
        <aside className="sticky top-0 hidden h-dvh w-52 shrink-0 border-e border-sidebar-border bg-sidebar md:block lg:w-60">
          <SidebarContents area={area} context={context} close={() => setOpen(false)} />
        </aside>
        <div className="min-w-0 flex-1">
          <Dialog.Root open={open} onOpenChange={setOpen}>
            <header className="sticky top-0 z-30 flex min-h-16 items-center gap-2 border-b border-border bg-sidebar px-3 md:hidden">
              <Dialog.Trigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11 shrink-0"
                  aria-label={t("nav.menu")}
                  aria-controls="area-drawer"
                >
                  <Menu />
                </Button>
              </Dialog.Trigger>
              <p className="min-w-0 flex-1 break-words text-sm font-medium">
                {context.active ? workspaceLabel(context.active) : t("ws.title")}
              </p>
              <UserMenu user={context.user} compact />
            </header>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-40 bg-foreground/30" />
              <Dialog.Content
                id="area-drawer"
                aria-describedby={undefined}
                className="fixed inset-y-0 start-0 z-50 w-72 max-w-[90%] border-e border-sidebar-border bg-sidebar pt-12 shadow-lg"
              >
                <Dialog.Title className="sr-only">{t("nav.menu")}</Dialog.Title>
                <Dialog.Close asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute end-3 top-2 size-11"
                    aria-label={t("nav.close")}
                  >
                    <X />
                  </Button>
                </Dialog.Close>
                <SidebarContents area={area} context={context} close={() => setOpen(false)} />
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
          <div className="min-w-0 pb-[env(safe-area-inset-bottom)]">{children}</div>
        </div>
      </div>
    </ActiveCompanyProvider>
  );
}
