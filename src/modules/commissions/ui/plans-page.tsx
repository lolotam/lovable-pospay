import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CompanyScope } from "@/modules/staff";
import { addPlanVersionFn, createPlanWithVersionFn } from "../functions/plans.functions";
import type { CommissionPlanDto } from "../contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t, type MessageKey } from "@/i18n";
import { kwdText, percentText } from "./format";
import { plansQuery } from "./commission-queries";
import { PlanMethodBuilder } from "./plan-method-builder";
import { buildPlanRulesInput, emptyBuilderState, type BuilderState } from "./builder-state";
import { PlanPreviewCard } from "./plan-preview-card";
import type { PreviewSample } from "./plan-preview";
import { StaffPlanAssignments } from "./staff-plan-assignments";

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3";

export function PlansPage() {
  return (
    <CompanyScope title="commissions.plansTitle">
      {(id) => <PlansScreen companyId={id} />}
    </CompanyScope>
  );
}

function PlansScreen({ companyId }: { companyId: string }) {
  const { data, fetchStatus, isFetchedAfterMount } = useQuery(plansQuery(companyId));
  if (fetchStatus !== "idle" || !isFetchedAfterMount)
    return <p role="status">{t("phone.loading")}</p>;
  if (data === undefined || data === null) return <p role="alert">{t("ops.forbidden")}</p>;
  return (
    <div className="space-y-8">
      <PlanVersions plans={data.plans} />
      <PlanBuilder companyId={companyId} plans={data.plans} />
      <StaffPlanAssignments companyId={companyId} staff={data.staff} plans={data.plans} />
    </div>
  );
}

function PlanVersions({ plans }: { plans: CommissionPlanDto[] }) {
  if (!plans.length) return <p role="status">{t("commissions.emptyPlans")}</p>;
  return (
    <section className="space-y-3">
      {plans.map((plan) => (
        <article key={plan.id} className="space-y-2 rounded-md border border-border bg-card p-4">
          <h2 className="text-lg font-semibold">{plan.name}</h2>
          <ul className="space-y-1 text-sm">
            {plan.versions.map((version) => (
              <li key={version.id}>
                {t("commissions.version")} {version.version} ·{" "}
                <bdi dir="ltr">{version.effectiveMonth}</bdi> ·{" "}
                <bdi dir="ltr">{describeRules(version.rules)}</bdi>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </section>
  );
}

/** نص موجز لقواعد إصدار للعرض في قائمة الإصدارات. */
function describeRules(rules: CommissionPlanDto["versions"][number]["rules"]): string {
  const parts: string[] = [];
  if (rules.baseRateBp !== null) parts.push(`${percentText(rules.baseRateBp)}%`);
  if (rules.baseFixedMills !== null) parts.push(kwdText(rules.baseFixedMills));
  if (rules.tierSchedule)
    parts.push(
      rules.tierSchedule.accumulator === "sales_amount"
        ? `${t(`commissions.mode.${rules.tierSchedule.mode}` as MessageKey)} × ${rules.tierSchedule.tiers.length}`
        : `${t("commissions.accumulatorSessions")} × ${rules.tierSchedule.tiers.length}`,
    );
  return parts.length ? parts.join(" + ") : "—";
}

function PlanBuilder({ companyId, plans }: { companyId: string; plans: CommissionPlanDto[] }) {
  const create = useServerFn(createPlanWithVersionFn);
  const addVersion = useServerFn(addPlanVersionFn);
  const cache = useQueryClient();
  const [target, setTarget] = useState<"new" | string>("new");
  const [name, setName] = useState("");
  const [month, setMonth] = useState("");
  const [state, setState] = useState<BuilderState>(emptyBuilderState);
  const [sample, setSample] = useState<PreviewSample>({
    sessionCount: "10",
    sessionNetKwd: "30.000",
    salaryKwd: "",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const canSubmit = !busy && monthPattern.test(month) && (target !== "new" || name.trim() !== "");
  async function submit() {
    setBusy(true);
    setMessage("");
    try {
      const rules = buildPlanRulesInput(state);
      if (target === "new") {
        await create({
          data: { companyId, name: name.trim(), effectiveMonth: `${month}-01`, rules },
        });
      } else {
        await addVersion({
          data: { companyId, planId: target, effectiveMonth: `${month}-01`, rules },
        });
      }
      setMessage(t("ops.saved"));
      await cache.invalidateQueries({ queryKey: ["commission-plans", companyId] });
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      setMessage(
        code === "PLAN_EMPTY"
          ? t("commissions.PLAN_EMPTY")
          : code === "PLAN_INVALID"
            ? t("commissions.PLAN_INVALID")
            : code === "FORBIDDEN"
              ? t("ops.denied")
              : t("ops.saveError"),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">{t("commissions.builderTitle")}</h2>
      <form
        className="grid gap-3 sm:grid-cols-[12rem_1fr_10rem_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="block space-y-2">
          <span>{t("commissions.addToPlan")}</span>
          <select
            className={selectClass}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="new">{t("commissions.newPlan")}</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-2">
          <span>{t("commissions.planName")}</span>
          <Input
            value={name}
            maxLength={80}
            disabled={target !== "new"}
            onChange={(e) => setName(e.target.value)}
            required={target === "new"}
          />
        </label>
        <label className="block space-y-2">
          <span>{t("commissions.effectiveMonth")}</span>
          <Input
            dir="ltr"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            required
          />
        </label>
        <Button disabled={!canSubmit}>
          {t(target === "new" ? "commissions.create" : "commissions.addVersion")}
        </Button>
      </form>
      {message && <p role="alert">{message}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <PlanMethodBuilder state={state} onChange={setState} />
        <PlanPreviewCard state={state} sample={sample} onSample={setSample} />
      </div>
    </section>
  );
}
