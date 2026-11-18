import { useSuspenseQuery } from "@tanstack/react-query";
import { t, type MessageKey } from "@/i18n";
import {
  platformOverviewQuery,
  connectorSummaryQuery,
  companyOverviewQuery,
  myOverviewQuery,
} from "./overview-query";
import type { SessionContextDto } from "../contracts";
export interface OverviewProps {
  context: SessionContextDto;
}
export interface OverviewCountsProps {
  rows: [MessageKey, string][];
}
function OverviewCounts({ rows }: OverviewCountsProps) {
  return (
    <section className="mx-auto grid max-w-5xl gap-4 px-4 pb-8 sm:grid-cols-3 sm:px-6">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-md border border-border p-5">
          <p className="text-sm text-muted-foreground">{t(label)}</p>
          <p className="mt-2 text-2xl font-semibold break-words">{value}</p>
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
        ["dashboard.companies", data.companies],
        ["dashboard.users", data.users],
        ["dashboard.connected", String(connectors.connected.length)],
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
        ["dashboard.present", data.present],
        ["dashboard.exceptions", data.exceptions],
        ["dashboard.staff", data.staff],
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
        ["dashboard.attendance", t(status[data.attendance ?? ""] ?? "dashboard.attendanceNone")],
        ["phone.title", t(data.bound ? "phone.bound" : "phone.notBound")],
      ]}
    />
  );
}
