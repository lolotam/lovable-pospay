import type { AttendanceReportRow, OperationalReport } from "../report.contracts";
import { Suspense, useState } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { CompanyScope } from "@/modules/staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";
import { getOperationalReportFn } from "../functions/report.functions";
import { buildTable, downloadCsv } from "./report-export";
export function ReportsPage() {
  return (
    <CompanyScope title="reports.title">{(id) => <ReportFilters companyId={id} />}</CompanyScope>
  );
}
function ReportFilters({ companyId }: { companyId: string }) {
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [range, setRange] = useState<{ from: string; until: string } | null>(null);
  const [error, setError] = useState(false);
  return (
    <div className="space-y-6">
      <form
        className="flex flex-wrap items-end gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(false);
          const a = new Date(from),
            b = new Date(until);
          if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime()) || b <= a) {
            setError(true);
            return;
          }
          setRange({ from: a.toISOString(), until: b.toISOString() });
        }}
      >
        <label className="min-w-0 space-y-2">
          <span>{t("reports.from")}</span>
          <Input
            type="datetime-local"
            required
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="min-w-0 space-y-2">
          <span>{t("reports.until")}</span>
          <Input
            type="datetime-local"
            required
            value={until}
            onChange={(e) => setUntil(e.target.value)}
          />
        </label>
        <Button>{t("reports.show")}</Button>
      </form>
      {error && <p role="alert">{t("reports.invalid")}</p>}
      {range && (
        <Suspense fallback={<p>{t("phone.loading")}</p>}>
          <ReportRows companyId={companyId} range={range} />
        </Suspense>
      )}
    </div>
  );
}
function ReportRows({
  companyId,
  range,
}: {
  companyId: string;
  range: { from: string; until: string };
}) {
  const { data } = useSuspenseQuery(
    queryOptions({
      queryKey: ["reports", companyId, range],
      queryFn: async () => {
        try {
          return await getOperationalReportFn({ data: { companyId, ...range } });
        } catch {
          return null;
        }
      },
    }),
  );
  const [tab, setTab] = useState<"attendance" | "corrected" | "services">("attendance");
  const [pdfBusy, setPdfBusy] = useState(false);
  if (!data) return <p role="alert">{t("ops.forbidden")}</p>;
  const rows = tab === "corrected" ? data.attendance.filter((r) => r.corrected) : data.attendance;
  return (
    <section className="space-y-4">
      <div role="tablist" className="flex flex-wrap gap-2">
        {(["attendance", "corrected", "services"] as const).map((v) => (
          <Button
            key={v}
            role="tab"
            aria-selected={tab === v}
            variant={tab === v ? "default" : "outline"}
            onClick={() => setTab(v)}
          >
            {t(
              v === "attendance"
                ? "reports.attendance"
                : v === "corrected"
                  ? "reports.corrected"
                  : "reports.services",
            )}
          </Button>
        ))}
        <Button
          variant="outline"
          onClick={() =>
            downloadCsv(buildTable(data, tab), `pospay-${tab}-${range.from.slice(0, 10)}`)
          }
        >
          {t("export.csv")}
        </Button>
        <Button
          variant="outline"
          disabled={pdfBusy}
          onClick={async () => {
            setPdfBusy(true);
            try {
              const { downloadPdf } = await import("./report-pdf");
              await downloadPdf(
                buildTable(data, tab),
                `${new Date(range.from).toLocaleString("ar-KW")} — ${new Date(range.until).toLocaleString("ar-KW")}`,
                `pospay-${tab}-${range.from.slice(0, 10)}`,
              );
            } finally {
              setPdfBusy(false);
            }
          }}
        >
          {t(pdfBusy ? "export.pdfBusy" : "export.pdf")}
        </Button>
      </div>
      {tab === "services" ? <SessionRows rows={data.sessions} /> : <AttendanceRows rows={rows} />}
    </section>
  );
}

function SessionRows({ rows }: { rows: OperationalReport["sessions"] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {rows.map((r) => (
        <article key={r.id} className="space-y-2 rounded-md border border-border bg-card p-4">
          <h3>
            {r.name} · {r.service}
          </h3>
          <p>
            {new Date(r.occurredAt).toLocaleString("ar-KW")}
            {r.late && <span className="ms-2 text-destructive">{t("reports.lateSession")}</span>}
          </p>
          {r.clientName && (
            <p>
              {t("reports.client")}: {r.clientName} <span dir="ltr">{r.clientPhone}</span>
            </p>
          )}
          <p dir="ltr">
            {`${BigInt(r.priceMills) / 1000n}.${(BigInt(r.priceMills) % 1000n).toString().padStart(3, "0")}`}{" "}
            {t("ops.kwd")}
          </p>
        </article>
      ))}
      {!rows.length && <p>{t("ops.empty")}</p>}
    </div>
  );
}
function AttendanceRows({ rows }: { rows: AttendanceReportRow[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((r) => (
        <article key={r.id} className="space-y-2 rounded-md border border-border bg-card p-4">
          <h3 className="font-semibold">
            {r.name} · {r.branch}
          </h3>
          <p>{r.workDate}</p>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-muted-foreground">{t("reports.in")}</dt>
              <dd>{new Date(r.checkIn).toLocaleString("ar-KW")}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("reports.out")}</dt>
              <dd>
                {r.checkOut ? new Date(r.checkOut).toLocaleString("ar-KW") : t("reports.open")}
              </dd>
            </div>
            {r.corrected && (
              <div>
                <dt className="text-muted-foreground">{t("reports.corrected")}</dt>
                <dd>
                  {new Date(r.corrected).toLocaleString("ar-KW")} · {r.reason}
                </dd>
              </div>
            )}
            <div>
              <dt>{t("reports.late")}</dt>
              <dd>{r.late}</dd>
            </div>
          </dl>
        </article>
      ))}
      {!rows.length && <p>{t("ops.empty")}</p>}
    </div>
  );
}
