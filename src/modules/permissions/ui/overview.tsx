import { useSuspenseQuery } from "@tanstack/react-query";
import {
  Buildings,
  CalendarCheck,
  DeviceMobile,
  Plug,
  UserCheck,
  Users,
  UsersThree,
  Warning,
  type Icon,
} from "@phosphor-icons/react";
import { t, type MessageKey } from "@/i18n";
import {
  platformOverviewQuery,
  connectorSummaryQuery,
  companyOverviewQuery,
  myOverviewQuery,
} from "./overview-query";
import type { SessionContextDto } from "../contracts";

type Tone = "teal" | "orange" | "navy" | "sand";
const TONES: Record<Tone, string> = {
  teal: "bg-tile-teal text-tile-teal-foreground",
  orange: "bg-cta text-cta-foreground",
  navy: "bg-tile-navy text-tile-navy-foreground",
  sand: "bg-tile-sand text-tile-sand-foreground",
};

export interface OverviewProps {
  context: SessionContextDto;
}
export interface OverviewRow {
  label: MessageKey;
  value: string;
  icon: Icon;
  tone: Tone;
}
export interface OverviewCountsProps {
  rows: OverviewRow[];
}
function OverviewCounts({ rows }: OverviewCountsProps) {
  return (
    <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-flow-col sm:auto-cols-fr sm:grid-cols-none">
      {rows.map(({ label, value, icon: TileIcon, tone }) => (
        <div
          key={label}
          className={`tile-hem relative overflow-hidden rounded-lg p-5 pb-8 first:col-span-2 last:even:col-span-2 sm:first:col-span-1 sm:last:even:col-span-1 ${TONES[tone]}`}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium">{t(label)}</p>
            <span
              aria-hidden
              className="grid size-10 shrink-0 place-items-center rounded-[0.875rem] bg-current/15"
            >
              <TileIcon weight="duotone" className="size-6" />
            </span>
          </div>
          <p className="mt-3 font-display text-4xl leading-tight font-bold break-words tabular-nums">
            {value}
          </p>
        </div>
      ))}
    </section>
  );
}
export function PlatformOverview() {
  const { data } = useSuspenseQuery(platformOverviewQuery);
  const { data: connectors } = useSuspenseQuery(connectorSummaryQuery);
  return (
    <OverviewCounts
      rows={[
        { label: "dashboard.companies", value: data.companies, icon: Buildings, tone: "teal" },
        { label: "dashboard.users", value: data.users, icon: Users, tone: "navy" },
        {
          label: "dashboard.connected",
          value: String(connectors.connected.length),
          icon: Plug,
          tone: "sand",
        },
      ]}
    />
  );
}
export function CompanyOverview({ context }: OverviewProps) {
  if (context.active?.kind !== "company") return null;
  return <CompanyCounts companyId={context.active.companyId} />;
}
function CompanyCounts({ companyId }: { companyId: string }) {
  const { data } = useSuspenseQuery(companyOverviewQuery(companyId));
  return (
    <OverviewCounts
      rows={[
        { label: "dashboard.present", value: data.present, icon: UserCheck, tone: "teal" },
        { label: "dashboard.exceptions", value: data.exceptions, icon: Warning, tone: "orange" },
        { label: "dashboard.staff", value: data.staff, icon: UsersThree, tone: "navy" },
      ]}
    />
  );
}
export function MyOverview({ context }: OverviewProps) {
  if (context.active?.kind !== "company") return null;
  return <MyState companyId={context.active.companyId} />;
}
function MyState({ companyId }: { companyId: string }) {
  const { data } = useSuspenseQuery(myOverviewQuery(companyId));
  const status: Record<string, MessageKey> = {
    open: "dashboard.attendanceOpen",
    ok: "dashboard.attendanceClosed",
    closed_late: "dashboard.attendanceClosed",
    forgotten: "dashboard.attendanceForgotten",
  };
  return (
    <OverviewCounts
      rows={[
        {
          label: "dashboard.attendance",
          value: t(status[data.attendance ?? ""] ?? "dashboard.attendanceNone"),
          icon: CalendarCheck,
          tone: "teal",
        },
        {
          label: "phone.title",
          value: t(data.bound ? "phone.bound" : "phone.notBound"),
          icon: DeviceMobile,
          tone: "sand",
        },
      ]}
    />
  );
}
