import { Link } from "@tanstack/react-router";
import * as Dialog from "@radix-ui/react-dialog";
import { List } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { tabNavigation, type NavGroup } from "./navigation";

export interface AreaTabBarProps {
  groups: NavGroup[];
  pathname: string;
}

/** شريط التنقل العائم على الهاتف. لازم يتحط جوه Dialog.Root لأن زر القائمة بيفتح الدرج. */
export function AreaTabBar({ groups, pathname }: AreaTabBarProps) {
  return (
    <nav
      aria-label={t("nav.primary")}
      className="area-tab-bar fixed start-3 end-3 [inset-block-end:calc(0.75rem+env(safe-area-inset-bottom))] z-30 flex items-center justify-between gap-1 rounded-full border border-border bg-card p-1.5 shadow-lg md:hidden"
    >
      {tabNavigation(groups, pathname).map(({ to, label, icon: TabIcon, active }) => (
        <Link
          key={to}
          to={to}
          activeOptions={{ exact: true }}
          aria-label={t(label)}
          aria-current={active ? "page" : undefined}
          className={`flex min-h-11 items-center justify-center gap-2 rounded-full text-xs font-medium transition-colors ${
            active
              ? "min-w-0 bg-primary px-3 text-primary-foreground"
              : "min-w-11 shrink-0 px-2.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <TabIcon aria-hidden weight={active ? "fill" : "duotone"} className="size-6 shrink-0" />
          {active && <span className="truncate">{t(label)}</span>}
        </Link>
      ))}
      <Dialog.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-11 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-6"
          aria-label={t("nav.menu")}
          aria-controls="area-drawer"
        >
          <List aria-hidden />
        </Button>
      </Dialog.Trigger>
    </nav>
  );
}
