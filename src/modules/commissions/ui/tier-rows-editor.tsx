import { Plus, Trash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";
import type { BuilderState, SalesTierRow, SessionTierRow } from "./builder-state";

const MAX_TIERS = 20;
const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3";

export interface TierRowsEditorProps {
  state: BuilderState;
  onChange: (next: BuilderState) => void;
}

/** محرر صفوف الشرائح: مبيعات أو عدد جلسات من 1 إلى 20 صفاً (021 M4، M5). */
export function TierRowsEditor({ state, onChange }: TierRowsEditorProps) {
  return state.accumulator === "sales_amount" ? (
    <SalesTierRows state={state} onChange={onChange} />
  ) : (
    <SessionTierRows state={state} onChange={onChange} />
  );
}

function SalesTierRows({
  state,
  onChange,
}: {
  state: BuilderState;
  onChange: (next: BuilderState) => void;
}) {
  const update = (index: number, patch: Partial<SalesTierRow>) =>
    onChange({
      ...state,
      salesTiers: state.salesTiers.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    });
  return (
    <div className="space-y-2">
      {state.salesTiers.map((row, index) => (
        <div key={index} className="flex items-end gap-2">
          <label className="block flex-1 space-y-1">
            <span>{t("commissions.ratePercent")}</span>
            <Input
              dir="ltr"
              inputMode="decimal"
              value={row.ratePercent}
              onChange={(e) => update(index, { ratePercent: e.target.value })}
            />
          </label>
          <label className="block flex-1 space-y-1">
            <span>
              {state.thresholdKind === "fixed"
                ? t("commissions.amountKwd")
                : t("commissions.multiple")}
            </span>
            <Input
              dir="ltr"
              inputMode="decimal"
              value={row.threshold}
              onChange={(e) => update(index, { threshold: e.target.value })}
            />
          </label>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={t("commissions.removeTier")}
            disabled={state.salesTiers.length <= 1}
            onClick={() =>
              onChange({
                ...state,
                salesTiers: state.salesTiers.filter((_, i) => i !== index),
              })
            }
          >
            <Trash aria-hidden />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={state.salesTiers.length >= MAX_TIERS}
        onClick={() =>
          onChange({
            ...state,
            salesTiers: [...state.salesTiers, { ratePercent: "", threshold: "" }],
          })
        }
      >
        <Plus aria-hidden />
        {t("commissions.addTier")}
      </Button>
    </div>
  );
}

function SessionTierRows({
  state,
  onChange,
}: {
  state: BuilderState;
  onChange: (next: BuilderState) => void;
}) {
  const update = (index: number, patch: Partial<SessionTierRow>) =>
    onChange({
      ...state,
      sessionTiers: state.sessionTiers.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    });
  return (
    <div className="space-y-2">
      {state.sessionTiers.map((row, index) => (
        <div key={index} className="flex items-end gap-2">
          <label className="block w-28 space-y-1">
            <span>{t("commissions.afterSessions")}</span>
            <Input
              dir="ltr"
              inputMode="numeric"
              value={row.afterSessions}
              onChange={(e) => update(index, { afterSessions: e.target.value })}
            />
          </label>
          <label className="block w-40 space-y-1">
            <span>{t("commissions.reward")}</span>
            <select
              className={selectClass}
              value={row.rewardKind}
              onChange={(e) =>
                update(index, { rewardKind: e.target.value as SessionTierRow["rewardKind"] })
              }
            >
              <option value="rate_bp">{t("commissions.rewardPercent")}</option>
              <option value="fixed_mills">{t("commissions.rewardFixed")}</option>
            </select>
          </label>
          <label className="block flex-1 space-y-1">
            <span>
              {row.rewardKind === "rate_bp"
                ? t("commissions.ratePercent")
                : t("commissions.amountKwd")}
            </span>
            <Input
              dir="ltr"
              inputMode="decimal"
              value={row.rewardValue}
              onChange={(e) => update(index, { rewardValue: e.target.value })}
            />
          </label>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={t("commissions.removeTier")}
            disabled={state.sessionTiers.length <= 1}
            onClick={() =>
              onChange({
                ...state,
                sessionTiers: state.sessionTiers.filter((_, i) => i !== index),
              })
            }
          >
            <Trash aria-hidden />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={state.sessionTiers.length >= MAX_TIERS}
        onClick={() =>
          onChange({
            ...state,
            sessionTiers: [
              ...state.sessionTiers,
              { afterSessions: "", rewardKind: "rate_bp", rewardValue: "" },
            ],
          })
        }
      >
        <Plus aria-hidden />
        {t("commissions.addTier")}
      </Button>
    </div>
  );
}
