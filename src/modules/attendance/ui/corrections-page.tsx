import { Suspense, useState } from "react";
import { Link } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyCompanies } from "@/lib/tenancy.functions";
import { isAuthNotConfigured } from "@/lib/auth-errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { t } from "@/i18n";
import { getForgottenAttendanceFn, correctAttendanceFn } from "../functions/correction.functions";
import type { ForgottenAttendanceDto } from "../correction.contracts";

const companiesQuery = queryOptions({
  queryKey: ["correction-companies"],
  queryFn: async () => {
    try {
      return { companies: await getMyCompanies(), error: null };
    } catch (error) {
      return {
        companies: [],
        error: isAuthNotConfigured(error)
          ? ("auth.notConfigured" as const)
          : ("attend.signInFirst" as const),
      };
    }
  },
});
const recordsQuery = (companyId: string) =>
  queryOptions({
    queryKey: ["forgotten-attendance", companyId],
    queryFn: async () => {
      try {
        return { records: await getForgottenAttendanceFn({ data: { companyId } }), error: null };
      } catch {
        return { records: [], error: "correction.error" as const };
      }
    },
  });

export function CorrectionsPage() {
  const { data } = useSuspenseQuery(companiesQuery);
  const [selected, setSelected] = useState("");
  const companies = data.companies.filter(
    (item, index, all) => all.findIndex((other) => other.id === item.id) === index,
  );
  const companyId = selected || companies[0]?.id || "";
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6 sm:py-16">
      <Link to="/sign-in" className="text-primary underline">
        {t("auth.signIn")}
      </Link>
      <h1 className="text-2xl font-bold">{t("correction.title")}</h1>
      {data.error ? (
        <p role="status">{t(data.error)}</p>
      ) : !companyId ? (
        <p>{t("phone.noCompanies")}</p>
      ) : (
        <>
          <label htmlFor="correction-company">{t("phone.companyName")}</label>
          <Select dir="rtl" value={companyId} onValueChange={setSelected}>
            <SelectTrigger id="correction-company">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {companies.map((company) => (
                <SelectItem value={company.id} key={company.id}>
                  {company.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Suspense fallback={<p role="status">{t("phone.loading")}</p>}>
            <CorrectionList key={companyId} companyId={companyId} />
          </Suspense>
        </>
      )}
    </main>
  );
}

function CorrectionList({ companyId }: { companyId: string }) {
  const query = recordsQuery(companyId);
  const { data } = useSuspenseQuery(query);
  const cache = useQueryClient();
  const [saved, setSaved] = useState<CorrectionResult | null>(null);
  if (data.error) return <p role="status">{t(data.error)}</p>;
  return (
    <div className="space-y-6">
      {saved && (
        <div role="status">
          <p>{t("correction.saved")}</p>
          <p>{formatCorrectionTime(saved.correctedAt, saved.timeZone)}</p>
          <p className="break-words">{saved.reason}</p>
        </div>
      )}
      {!data.records.length && <p>{t("correction.empty")}</p>}
      {data.records.map((record) => (
        <CorrectionItem
          key={record.id}
          record={record}
          companyId={companyId}
          onSaved={(result) => {
            setSaved({ ...result, timeZone: record.timeZone });
            cache.setQueryData(query.queryKey, (current) =>
              current?.error === null
                ? { records: current.records.filter(({ id }) => id !== result.id), error: null }
                : current,
            );
          }}
        />
      ))}
    </div>
  );
}

type SavedCorrection = { id: string; correctedAt: string; reason: string };
type CorrectionResult = SavedCorrection & { timeZone: string };

interface CorrectionItemProps {
  record: ForgottenAttendanceDto;
  companyId: string;
  onSaved: (result: SavedCorrection) => void;
}
function useCorrection(props: CorrectionItemProps) {
  const [time, setTime] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const save = useServerFn(correctAttendanceFn);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = await save({
        data: { companyId: props.companyId, recordId: props.record.id, correctedAt: time, reason },
      });
      props.onSaved(result);
    } catch {
      setMessage(t("correction.error"));
    } finally {
      setBusy(false);
    }
  }
  return { time, setTime, reason, setReason, busy, message, submit };
}
function formatCorrectionTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("ar-KW", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function CorrectionItem(props: CorrectionItemProps) {
  const { record } = props;
  const state = useCorrection(props);
  const format = (value: string) => formatCorrectionTime(value, record.timeZone);
  return (
    <article className="space-y-4 border-b border-border py-6">
      <h2 className="text-lg font-bold break-words">
        {record.staffName} · {record.branchName}
      </h2>
      <p className="text-sm text-muted-foreground">
        {record.workDate} · {t("correction.zone")}: {record.timeZone}
      </p>
      <p>
        {t("correction.checkIn")}: {format(record.checkInAt)}
      </p>
      <p>
        {t("correction.original")}:{" "}
        {record.checkOutAt ? format(record.checkOutAt) : t("correction.missing")}
      </p>
      <form onSubmit={state.submit} className="space-y-4">
        <label htmlFor={`time-${record.id}`} className="block">
          {t("correction.time")}
        </label>
        <Input
          id={`time-${record.id}`}
          dir="ltr"
          required
          placeholder={t("correction.placeholder")}
          value={state.time}
          onChange={(event) => state.setTime(event.target.value)}
          disabled={state.busy}
        />
        <label htmlFor={`reason-${record.id}`} className="block">
          {t("correction.reason")}
        </label>
        <Textarea
          id={`reason-${record.id}`}
          required
          maxLength={2000}
          value={state.reason}
          onChange={(event) => state.setReason(event.target.value)}
          disabled={state.busy}
        />
        <Button type="submit" disabled={state.busy || !state.reason.trim()}>
          {t(state.busy ? "auth.busy" : "correction.save")}
        </Button>
      </form>
      <p role="status">{state.message}</p>
    </article>
  );
}
