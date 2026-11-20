import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";
import type { BuilderState } from "./builder-state";
import { TierRowsEditor } from "./tier-rows-editor";

const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3";

export interface PlanMethodBuilderProps {
  state: BuilderState;
  onChange: (next: BuilderState) => void;
}

/** بانِي الطرق الأربع: قاعدة نسبية وثابتة وشرائح مبيعات أو جلسات قابلة للدمج (021 E). */
export function PlanMethodBuilder({ state, onChange }: PlanMethodBuilderProps) {
  return (
    <div className="space-y-4">
      <MethodToggle
        enabled={state.baseRateEnabled}
        label={t("commissions.methodBaseRate")}
        onToggle={() => onChange({ ...state, baseRateEnabled: !state.baseRateEnabled })}
      >
        <label className="block space-y-2">
          <span>{t("commissions.ratePercent")}</span>
          <Input
            dir="ltr"
            inputMode="decimal"
            value={state.baseRatePercent}
            onChange={(e) => onChange({ ...state, baseRatePercent: e.target.value })}
          />
        </label>
      </MethodToggle>
      <MethodToggle
        enabled={state.baseFixedEnabled}
        label={t("commissions.methodBaseFixed")}
        onToggle={() => onChange({ ...state, baseFixedEnabled: !state.baseFixedEnabled })}
      >
        <label className="block space-y-2">
          <span>{t("commissions.amountKwd")}</span>
          <Input
            dir="ltr"
            inputMode="decimal"
            value={state.baseFixedKwd}
            onChange={(e) => onChange({ ...state, baseFixedKwd: e.target.value })}
          />
        </label>
      </MethodToggle>
      <MethodToggle
        enabled={state.tiersEnabled}
        label={t("commissions.methodTiers")}
        onToggle={() => onChange({ ...state, tiersEnabled: !state.tiersEnabled })}
      >
        <TierScheduleEditor state={state} onChange={onChange} />
      </MethodToggle>
    </div>
  );
}

function MethodToggle({
  enabled,
  label,
  onToggle,
  children,
}: {
  enabled: boolean;
  label: string;
  onToggle: () => void;
  children?: ReactNode;
}) {
  return (
    <fieldset className="space-y-3 rounded-md border border-border p-3">
      <legend className="px-1">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={enabled} onChange={onToggle} />
          {label}
        </label>
      </legend>
      {enabled && children}
    </fieldset>
  );
}

function TierScheduleEditor({
  state,
  onChange,
}: {
  state: BuilderState;
  onChange: (next: BuilderState) => void;
}) {
  const set = <K extends keyof BuilderState>(key: K, value: BuilderState[K]) =>
    onChange({ ...state, [key]: value });
  return (
    <div className="space-y-3">
      <label className="block space-y-2">
        <span>{t("commissions.accumulator")}</span>
        <select
          className={selectClass}
          value={state.accumulator}
          onChange={(e) => set("accumulator", e.target.value as BuilderState["accumulator"])}
        >
          <option value="sales_amount">{t("commissions.accumulatorSales")}</option>
          <option value="session_count">{t("commissions.accumulatorSessions")}</option>
        </select>
      </label>
      {state.accumulator === "sales_amount" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-2">
            <span>{t("commissions.mode")}</span>
            <select
              className={selectClass}
              value={state.mode}
              onChange={(e) => set("mode", e.target.value as BuilderState["mode"])}
            >
              <option value="excess">{t("commissions.mode.excess")}</option>
              <option value="all_after">{t("commissions.mode.all_after")}</option>
            </select>
          </label>
          <label className="block space-y-2">
            <span>{t("commissions.thresholdKind")}</span>
            <select
              className={selectClass}
              value={state.thresholdKind}
              onChange={(e) =>
                set("thresholdKind", e.target.value as BuilderState["thresholdKind"])
              }
            >
              <option value="fixed">{t("commissions.thresholdFixed")}</option>
              <option value="salary_multiple">{t("commissions.thresholdSalaryMultiple")}</option>
            </select>
          </label>
        </div>
      )}
      <TierRowsEditor state={state} onChange={onChange} />
    </div>
  );
}
