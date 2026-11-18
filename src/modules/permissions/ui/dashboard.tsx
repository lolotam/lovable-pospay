import { Link } from "@tanstack/react-router";
import { ArrowUpLeft } from "lucide-react";
import { t } from "@/i18n";
import { Button } from "@/components/ui/button";
import type { Area, SessionContextDto } from "../contracts";
import { visibleNavigation } from "./navigation";
import { serviceSessionRecordingAvailable } from "@/modules/services";
import { workspaceLabel } from "./workspace-switcher";

export interface DashboardProps {
  area: Area;
  context: SessionContextDto;
}
export function Dashboard({ area, context }: DashboardProps) {
  const links = visibleNavigation(area, context.permissions, serviceSessionRecordingAvailable)
    .flatMap((group) => group.children ?? (group.to ? [{ ...group, to: group.to }] : []))
    .filter((item) => item.to !== `/${area}` && !item.to.endsWith("/settings"));
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <p className="text-sm text-muted-foreground">{t("dashboard.welcome")}</p>
      <h1 className="mt-2 text-3xl font-bold break-words">
        {context.active ? workspaceLabel(context.active) : t("nav.dashboard")}
      </h1>
      <h2 className="mt-10 mb-4 text-sm font-medium">{t("dashboard.quickLinks")}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((item) => (
          <Button
            asChild
            key={item.to}
            variant="outline"
            className="h-auto min-h-28 justify-between whitespace-normal p-5 text-start"
          >
            <Link to={item.to}>
              <span className="flex items-center gap-3">
                <span aria-hidden className="text-xl">
                  {item.icon}
                </span>
                {t(item.label)}
              </span>
              <ArrowUpLeft className="shrink-0 size-4" />
            </Link>
          </Button>
        ))}
      </div>
    </main>
  );
}
