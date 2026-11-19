import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpLeft } from "@phosphor-icons/react";
import { t } from "@/i18n";
import type { Area, SessionContextDto } from "../contracts";
import { visibleNavigation } from "./navigation";
import { serviceSessionRecordingAvailable } from "@/modules/services";
import { workspaceLabel } from "./workspace-switcher";

const CHIP_TONES = [
  "bg-success-soft text-success",
  "bg-accent text-accent-foreground",
  "bg-tile-sand text-tile-sand-foreground",
];

export interface DashboardProps {
  area: Area;
  context: SessionContextDto;
  /** ملخص الأرقام، بيظهر بين العنوان والروابط السريعة. */
  children?: ReactNode;
}
export function Dashboard({ area, context, children }: DashboardProps) {
  const links = visibleNavigation(area, context.permissions, serviceSessionRecordingAvailable)
    .flatMap((group) => group.children ?? (group.to ? [{ ...group, to: group.to }] : []))
    .filter((item) => item.to !== `/${area}` && !item.to.endsWith("/settings"));
  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
      <p className="text-sm text-muted-foreground">{t("dashboard.welcome")}</p>
      <h1 className="mt-1 text-3xl break-words sm:text-4xl">
        {context.active ? workspaceLabel(context.active) : t("nav.dashboard")}
      </h1>
      {children}
      <h2 className="mt-8 mb-3 text-lg">{t("dashboard.quickLinks")}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {links.map(({ to, label, icon: LinkIcon }, index) => (
          <Link
            key={to}
            to={to}
            className="flex min-h-20 items-center gap-3 rounded-lg bg-card p-4 shadow-sm ring-1 ring-border transition-shadow hover:shadow-md"
          >
            <span
              aria-hidden
              className={`grid size-11 shrink-0 place-items-center rounded-[0.875rem] ${CHIP_TONES[index % CHIP_TONES.length]}`}
            >
              <LinkIcon weight="duotone" className="size-6" />
            </span>
            <span className="min-w-0 flex-1 font-medium break-words">{t(label)}</span>
            <ArrowUpLeft
              aria-hidden
              className="size-4 shrink-0 text-muted-foreground ltr:-scale-x-100"
            />
          </Link>
        ))}
      </div>
    </main>
  );
}
