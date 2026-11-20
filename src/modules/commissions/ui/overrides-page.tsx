import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CompanyScope } from "@/modules/staff";
import { saveServiceOverrideFn } from "../functions/overrides.functions";
import type { ServiceOverridesScreenDto } from "../contracts";
import { t } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { overridesQuery } from "./commission-queries";
import { kwdText, percentText } from "./format";

const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3";

export function OverridesPage() {
  return (
    <CompanyScope title="overrides.title">
      {(id) => <OverridesScreen companyId={id} />}
    </CompanyScope>
  );
}

function OverridesScreen({ companyId }: { companyId: string }) {
  const { data, fetchStatus, isFetchedAfterMount } = useQuery(overridesQuery(companyId));
  if (fetchStatus !== "idle" || !isFetchedAfterMount)
    return <p role="status">{t("phone.loading")}</p>;
  if (data === undefined || data === null) return <p role="alert">{t("ops.forbidden")}</p>;
  return (
    <div className="space-y-6">
      <p className="text-muted-foreground">{t("overrides.manageHint")}</p>
      {data.canManage && <OverrideForm companyId={companyId} screen={data} />}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("overrides.history")}</h2>
        {!data.overrides.length ? (
          <p role="status">{t("ops.empty")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("overrides.service")}</TableHead>
                <TableHead>{t("overrides.staff")}</TableHead>
                <TableHead>{t("overrides.kind")}</TableHead>
                <TableHead>{t("overrides.effectiveFrom")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.overrides.map((override) => (
                <TableRow key={override.id}>
                  <TableCell>{override.serviceName}</TableCell>
                  <TableCell>
                    {override.staffId === null ? t("overrides.allStaff") : override.staffName}
                  </TableCell>
                  <TableCell>{overrideText(override)}</TableCell>
                  <TableCell>
                    <bdi dir="ltr">{new Date(override.effectiveFrom).toLocaleString()}</bdi>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}

/** نص التجاوز في السجل: نسبة أو مبلغ أو رجوع للخطة. */
function overrideText(override: ServiceOverridesScreenDto["overrides"][number]): string {
  if (override.override.kind === "clear") return t("overrides.kind.clear");
  if (override.override.kind === "rate_bp")
    return `${t("overrides.kind.rate_bp")} ${percentText(override.override.rateBp)}`;
  return `${t("overrides.kind.fixed_mills")} ${kwdText(override.override.mills)}`;
}

function OverrideForm({
  companyId,
  screen,
}: {
  companyId: string;
  screen: ServiceOverridesScreenDto;
}) {
  const save = useServerFn(saveServiceOverrideFn);
  const cache = useQueryClient();
  const [serviceId, setServiceId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [kind, setKind] = useState<"rate_bp" | "fixed_mills" | "clear">("rate_bp");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const needsValue = kind !== "clear";
  const canSubmit = serviceId !== "" && (!needsValue || value.trim() !== "") && !busy;
  async function submit() {
    setBusy(true);
    setMessage("");
    try {
      await save({
        data: {
          companyId,
          serviceId,
          ...(staffId !== "" ? { staffId } : { staffId: null }),
          override:
            kind === "rate_bp"
              ? { kind: "rate_bp", ratePercent: value }
              : kind === "fixed_mills"
                ? { kind: "fixed_mills", kwd: value }
                : { kind: "clear" },
        },
      });
      setMessage(t("overrides.saved"));
      setValue("");
      await cache.invalidateQueries({ queryKey: ["service-overrides", companyId] });
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      setMessage(
        code === "OVERRIDE_INVALID"
          ? t("overrides.OVERRIDE_INVALID")
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
      className="grid gap-3 sm:grid-cols-[1fr_1fr_12rem_1fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label className="block space-y-2">
        <span>{t("overrides.service")}</span>
        <select
          className={selectClass}
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
          required
        >
          <option value="">{t("sessions.choose")}</option>
          {screen.services.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-2">
        <span>{t("overrides.staff")}</span>
        <select
          className={selectClass}
          value={staffId}
          onChange={(e) => setStaffId(e.target.value)}
        >
          <option value="">{t("overrides.allStaff")}</option>
          {screen.staff.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-2">
        <span>{t("overrides.kind")}</span>
        <select
          className={selectClass}
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
        >
          <option value="rate_bp">{t("overrides.kind.rate_bp")}</option>
          <option value="fixed_mills">{t("overrides.kind.fixed_mills")}</option>
          <option value="clear">{t("overrides.kind.clear")}</option>
        </select>
      </label>
      {needsValue && (
        <label className="block space-y-2">
          <span>
            {kind === "rate_bp" ? t("commissions.ratePercent") : t("commissions.amountKwd")}
          </span>
          <Input
            dir="ltr"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
          />
        </label>
      )}
      <Button disabled={!canSubmit}>{t("overrides.save")}</Button>
      {message && (
        <p role="status" className="sm:col-span-full">
          {message}
        </p>
      )}
    </form>
  );
}
