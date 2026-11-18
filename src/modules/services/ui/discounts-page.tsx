import { useState } from "react";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CompanyScope } from "@/modules/staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t, type MessageKey } from "@/i18n";
import { companyRoles } from "../contracts";
import {
  getDiscountSettingsFn,
  revokeDiscountGrantFn,
  saveDiscountGrantFn,
} from "../functions/discount.functions";

const settingsQuery = (companyId: string) =>
  queryOptions({
    queryKey: ["discount-settings", companyId],
    queryFn: async () => {
      try {
        return await getDiscountSettingsFn({ data: { companyId } });
      } catch {
        return null;
      }
    },
  });
const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3";
const roleLabel = (r: string) => t(`discounts.role.${r}` as MessageKey);

export function DiscountsPage() {
  return (
    <CompanyScope title="discounts.title">
      {(id) => <DiscountSettings companyId={id} />}
    </CompanyScope>
  );
}
function DiscountSettings({ companyId }: { companyId: string }) {
  const { data } = useSuspenseQuery(settingsQuery(companyId));
  const qc = useQueryClient();
  const save = useServerFn(saveDiscountGrantFn);
  const revoke = useServerFn(revokeDiscountGrantFn);
  const [target, setTarget] = useState("role:reception");
  const [pct, setPct] = useState("10");
  const [message, setMessage] = useState("");
  if (!data?.canManage) return <p role="alert">{t("ops.forbidden")}</p>;
  const refresh = () => qc.invalidateQueries({ queryKey: ["discount-settings", companyId] });
  async function submit() {
    const [kind, value] = target.split(/:(.*)/s);
    try {
      await save({
        data: {
          companyId,
          maxPercent: Number(pct),
          target:
            kind === "role"
              ? { kind: "role", role: value as (typeof companyRoles)[number] }
              : { kind: "user", userId: value },
        },
      });
      setMessage(t("discounts.saved"));
      await refresh();
    } catch {
      setMessage(t("sessions.error"));
    }
  }
  return (
    <section className="max-w-2xl space-y-6">
      <p className="text-muted-foreground">{t("discounts.hint")}</p>
      <form
        className="grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="block space-y-2">
          <span>{t("discounts.target")}</span>
          <select
            className={selectClass}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            <optgroup label={t("discounts.roles")}>
              {companyRoles.map((r) => (
                <option key={r} value={`role:${r}`}>
                  {roleLabel(r)}
                </option>
              ))}
            </optgroup>
            <optgroup label={t("discounts.members")}>
              {data.members.map((m) => (
                <option key={m.userId} value={`user:${m.userId}`}>
                  {m.name}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <label className="block space-y-2">
          <span>{t("discounts.max")}</span>
          <Input
            dir="ltr"
            type="number"
            min={1}
            max={100}
            value={pct}
            onChange={(e) => setPct(e.target.value)}
            required
          />
        </label>
        <Button>{t("discounts.grant")}</Button>
      </form>
      <p role="status">{message}</p>
      <ul className="space-y-2">
        {data.grants.map((g) => (
          <li
            key={g.id}
            className="flex items-center justify-between gap-3 rounded-md border border-border bg-card p-3"
          >
            <span>
              {g.role ? roleLabel(g.role) : (g.name ?? g.userId)} · {g.maxPercent}%
            </span>
            <Button
              variant="outline"
              onClick={async () => {
                if (confirm(t("discounts.confirmRevoke"))) {
                  await revoke({ data: { companyId, id: g.id } });
                  await refresh();
                }
              }}
            >
              {t("discounts.revoke")}
            </Button>
          </li>
        ))}
        {!data.grants.length && <li>{t("ops.empty")}</li>}
      </ul>
    </section>
  );
}
