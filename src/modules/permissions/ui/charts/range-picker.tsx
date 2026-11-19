import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import type { ChartRange } from "../../contracts";
export interface RangePickerProps {
  range: ChartRange;
  onChange: (range: ChartRange) => void;
}
export function RangePicker({ range, onChange }: RangePickerProps) {
  return (
    <div role="group" aria-label={t("charts.range")} className="flex gap-1">
      {([7, 14, 30] as const).map((r) => (
        <Button
          key={r}
          variant={r === range ? "default" : "outline"}
          className="min-h-11"
          aria-pressed={r === range}
          onClick={() => onChange(r)}
        >
          {r}
        </Button>
      ))}
    </div>
  );
}
