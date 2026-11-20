import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CompanyScope } from "@/modules/staff";
import { recordSalaryFn } from "../functions/salaries.functions";
import type { StaffSalariesScreenDto } from "../contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";
import { kwdText } from "./format";
import { salariesQuery } from "./commission-queries";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3";

export function SalariesPage() {
  return (
    <CompanyScope title="salaries.title">{(id) => <SalariesScreen companyId={id} />}</CompanyScope>
  );
}

function SalariesScreen({ companyId }: { companyId: string }) {
  const { data, fetchStatus, isFetchedAfterMount } = useQuery(salariesQuery(companyId));
  if (fetchStatus !== "idle" || !isFetchedAfterMount)
    return <p role="status">{t("phone.loading")}</p>;
  if (data === undefined || data === null) return <p role="alert">{t("ops.forbidden")}</p>;
  return (
    <div className="space-y-6">
      <SalaryForm companyId={companyId} screen={data} />
      <section className="space-y-3">
        {data.staff.map((member) => (
          <StaffSalaryCard key={member.staffId} member={member} />
        ))}
        {!data.staff.length && <p role="status">{t("ops.empty")}</p>}
      </section>
    </div>
  );
}

function SalaryForm({ companyId, screen }: { companyId: string; screen: StaffSalariesScreenDto }) {
  const save = useServerFn(recordSalaryFn);
  const cache = useQueryClient();
  const [staffId, setStaffId] = useState("");
  const [salaryKwd, setSalaryKwd] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const canSubmit =
    staffId !== "" && salaryKwd.trim() !== "" && datePattern.test(effectiveDate) && !busy;
  async function submit() {
    setBusy(true);
    setMessage("");
    try {
      await save({ data: { companyId, staffId, salaryKwd, effectiveDate } });
      setMessage(t("salaries.recorded"));
      await cache.invalidateQueries({ queryKey: ["staff-salaries", companyId] });
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      setMessage(
        code === "SALARY_MONTH_CLOSED"
          ? t("salaries.SALARY_MONTH_CLOSED")
          : code === "FORBIDDEN"
            ? t("ops.denied")
            : t("ops.saveError"),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_10rem_12rem_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label className="block space-y-2">
        <span>{t("salaries.staff")}</span>
        <select
          className={selectClass}
          value={staffId}
          onChange={(e) => setStaffId(e.target.value)}
          required
        >
          <option value="">{t("sessions.choose")}</option>
          {screen.staff.map((member) => (
            <option key={member.staffId} value={member.staffId}>
              {member.staffName}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-2">
        <span>{t("salaries.salaryKwd")}</span>
        <Input
          dir="ltr"
          inputMode="decimal"
          value={salaryKwd}
          onChange={(e) => setSalaryKwd(e.target.value)}
          required
        />
      </label>
      <label className="block space-y-2">
        <span>{t("salaries.effectiveDate")}</span>
        <Input
          dir="ltr"
          type="date"
          value={effectiveDate}
          onChange={(e) => setEffectiveDate(e.target.value)}
          required
        />
      </label>
      <Button disabled={!canSubmit}>{t("salaries.record")}</Button>
      {message && (
        <p role="status" className="sm:col-span-full">
          {message}
        </p>
      )}
    </form>
  );
}

function StaffSalaryCard({ member }: { member: StaffSalariesScreenDto["staff"][number] }) {
  return (
    <article className="space-y-2 rounded-md border border-border bg-card p-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">{member.staffName}</h2>
        <span>
          {t("salaries.current")}:{" "}
          <bdi dir="ltr">
            {member.currentSalaryMills === null
              ? t("salaries.noSalary")
              : kwdText(member.currentSalaryMills)}
          </bdi>
        </span>
      </div>
      {member.history.length > 0 && (
        <details>
          <summary className="cursor-pointer">{t("salaries.history")}</summary>
          <ul className="mt-2 space-y-1">
            {member.history.map((entry) => (
              <li key={entry.id}>
                <bdi dir="ltr">{entry.effectiveDate}</bdi> ·{" "}
                <bdi dir="ltr">{kwdText(entry.salaryMills)}</bdi> · {t("salaries.recordedAt")}{" "}
                <bdi dir="ltr">{new Date(entry.recordedAt).toLocaleString()}</bdi>
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}
