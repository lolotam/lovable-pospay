import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import * as Dialog from "@radix-ui/react-dialog";
import { CaretDown, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { serviceSessionRecordingAvailable } from "@/modules/services";
import type { Area, SessionContextDto } from "../contracts";
import { visibleNavigation, type NavGroup, type NavLeaf } from "./navigation";
import { AreaTabBar } from "./area-tab-bar";
import { WorkspaceSwitcher, workspaceLabel } from "./workspace-switcher";
import { UserMenu } from "./user-menu";
import { ActiveCompanyProvider } from "@/lib/active-company";

export interface AreaShellProps {
  area: Area;
  context: SessionContextDto;
  children: ReactNode;
}

function BrandMark() {
  return (
    <img
      src="/brand/logo-mark-simple-tile.png"
      alt=""
      width={36}
      height={36}
      className="size-9 shrink-0 rounded-[0.625rem]"
    />
  );
}

function NavigationLeaf({ item, close }: { item: NavLeaf; close: () => void }) {
  const LeafIcon = item.icon;
  return (
    <Link
      to={item.to}
      onClick={close}
      activeOptions={{ exact: true }}
      className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-2 focus-visible:outline-ring data-[status=active]:bg-sidebar-primary data-[status=active]:font-medium data-[status=active]:text-sidebar-primary-foreground"
    >
      <LeafIcon aria-hidden weight="duotone" className="size-5 shrink-0" />
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
  const GroupIcon = group.icon;
  return (
    <div>
      <Button
        variant="ghost"
        className="h-auto min-h-11 w-full justify-between rounded-lg px-3 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground [&_svg]:size-5"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="flex items-center gap-3">
          <GroupIcon aria-hidden weight="duotone" />
          {t(group.label)}
        </span>
        <CaretDown aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </Button>
      {open && (
        <div className="ms-5 space-y-1 border-s border-sidebar-border py-1 ps-2">
          {group.children?.map((item) => (
            <NavigationLeaf key={item.to} item={item} close={close} />
          ))}
        </div>
      )}
    </div>
  );
}

function SidebarContents({
  groups,
  context,
  pathname,
  close,
}: {
  groups: NavGroup[];
  context: SessionContextDto;
  pathname: string;
  close: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-sidebar-border px-3 py-4">
        <Link
          to="/"
          className="flex items-center gap-2 px-2 font-display text-2xl leading-none font-extrabold"
        >
          <BrandMark />
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
        {groups.map((group) => (
          <NavigationGroup key={group.label} group={group} close={close} pathname={pathname} />
        ))}
      </nav>
      <UserMenu user={context.user} />
    </div>
  );
}

function AreaDrawer({ children }: { children: ReactNode }) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-foreground/30" />
      <Dialog.Content
        id="area-drawer"
        aria-describedby={undefined}
        className="fixed inset-y-0 start-0 z-50 w-72 max-w-[90%] rounded-e-xl border-e border-sidebar-border bg-sidebar pt-12 text-sidebar-foreground shadow-lg"
      >
        <Dialog.Title className="sr-only">{t("nav.menu")}</Dialog.Title>
        <Dialog.Close asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute end-3 top-2 size-11 rounded-full [&_svg]:size-5"
            aria-label={t("nav.close")}
          >
            <X aria-hidden />
          </Button>
        </Dialog.Close>
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  );
}

export function AreaShell({ area, context, children }: AreaShellProps) {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  useEffect(() => setOpen(false), [pathname, context.active]);
  const activeCompany = context.active?.kind === "company" ? context.active.companyId : null;
  const groups = visibleNavigation(area, context.permissions, serviceSessionRecordingAvailable);
  const sidebar = (
    <SidebarContents
      groups={groups}
      context={context}
      pathname={pathname}
      close={() => setOpen(false)}
    />
  );
  return (
    <ActiveCompanyProvider value={activeCompany}>
      <div className="flex min-h-dvh bg-background text-foreground">
        <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 py-3 ps-3 md:block lg:w-64">
          <div className="h-full overflow-hidden rounded-xl border border-sidebar-border bg-sidebar text-sidebar-foreground shadow-sm">
            {sidebar}
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          <Dialog.Root open={open} onOpenChange={setOpen}>
            <header className="sticky top-0 z-30 flex min-h-16 items-center gap-3 bg-background/90 px-4 backdrop-blur md:hidden">
              <BrandMark />
              <p className="min-w-0 flex-1 break-words text-sm font-medium">
                {context.active ? workspaceLabel(context.active) : t("ws.title")}
              </p>
              <UserMenu user={context.user} compact />
            </header>
            <AreaTabBar groups={groups} pathname={pathname} />
            <AreaDrawer>{sidebar}</AreaDrawer>
          </Dialog.Root>
          <div className="min-w-0 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-[env(safe-area-inset-bottom)]">
            {children}
          </div>
        </div>
      </div>
    </ActiveCompanyProvider>
  );
}
