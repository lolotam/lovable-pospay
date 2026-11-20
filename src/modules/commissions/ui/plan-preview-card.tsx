import { useState } from "react";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";
import type { BuilderState } from "./builder-state";
import { computePreview, type PreviewSample } from "./plan-preview";

const millsText = (mills: bigint | null): string =>
  mills === null ? "—" : `${mills / 1000n}.${(mills % 1000n).toString().padStart(3, "0")}`;

export interface PlanPreviewCardProps {
  state: BuilderState;
  sample: PreviewSample;
  onSample: (next: PreviewSample) => void;
}

/** حاسبة تجريبية حية تحسب بالدالة الصافية للمجال دون أي نداء خادم (021 E). */
export function PlanPreviewCard({ state, sample, onSample }: PlanPreviewCardProps) {
  const result = computePreview(state, sample);
  const set = (key: keyof PreviewSample) => (value: string) =>
    onSample({ ...sample, [key]: value });
  return (
    <section className="space-y-3 rounded-md border border-border bg-card p-4">
      <h3 className="font-semibold">{t("commissions.previewTitle")}</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block space-y-1">
          <span>{t("commissions.previewSessions")}</span>
          <Input
            dir="ltr"
            inputMode="numeric"
            value={sample.sessionCount}
            onChange={(e) => set("sessionCount")(e.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span>{t("commissions.previewSessionNet")}</span>
          <Input
            dir="ltr"
            inputMode="decimal"
            value={sample.sessionNetKwd}
            onChange={(e) => set("sessionNetKwd")(e.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span>{t("commissions.previewSalary")}</span>
          <Input
            dir="ltr"
            inputMode="decimal"
            value={sample.salaryKwd}
            onChange={(e) => set("salaryKwd")(e.target.value)}
          />
        </label>
      </div>
      {result === null ? (
        <p role="status">{t("commissions.previewInvalid")}</p>
      ) : (
        <dl className="space-y-1 text-sm">
          <PreviewRow
            label={t("commissions.previewQualifying")}
            mills={result.qualifyingSalesMills}
          />
          <PreviewRow label={t("commissions.previewBaseRate")} mills={result.baseRateMills} />
          <PreviewRow label={t("commissions.previewBaseFixed")} mills={result.baseFixedMills} />
          <PreviewRow label={t("commissions.previewTiers")} mills={result.tierMills} />
          <PreviewRow label={t("commissions.previewOverride")} mills={result.overrideMills} />
          <PreviewRow label={t("commissions.previewTotal")} mills={result.totalMills} strong />
        </dl>
      )}
    </section>
  );
}

function PreviewRow({
  label,
  mills,
  strong = false,
}: {
  label: string;
  mills: bigint;
  strong?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 ${strong ? "font-bold" : ""}`}>
      <dt>{label}</dt>
      <dd dir="ltr">{millsText(mills)}</dd>
    </div>
  );
}
