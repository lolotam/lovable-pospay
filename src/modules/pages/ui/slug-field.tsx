import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";
import { validSlug, normalizeSlug } from "../domain/slug";
export interface SlugFieldProps {
  value: string;
  onChange: (slug: string) => void;
  check: (slug: string) => Promise<boolean>;
  onValidity: (valid: boolean) => void;
}
export function SlugField({ value, onChange, check, onValidity }: SlugFieldProps) {
  const [status, setStatus] = useState<
    "invalidSlug" | "checking" | "available" | "taken" | "failed"
  >("invalidSlug");
  useEffect(() => {
    let alive = true;
    onValidity(false);
    if (!validSlug(value)) {
      setStatus("invalidSlug");
      return;
    }
    setStatus("checking");
    const timer = setTimeout(() => {
      void check(value)
        .then((available) => {
          if (alive) {
            setStatus(available ? "available" : "taken");
            onValidity(available);
          }
        })
        .catch(() => {
          if (alive) setStatus("failed");
        });
    }, 400);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [value, check, onValidity]);
  return (
    <div className="space-y-2">
      <label htmlFor="page-slug" className="text-sm font-medium">
        {t("pages.slug")}
      </label>
      <Input
        id="page-slug"
        className="min-h-11"
        dir="ltr"
        value={value}
        maxLength={40}
        aria-describedby="page-slug-status"
        onChange={(e) => onChange(normalizeSlug(e.target.value))}
      />
      <p id="page-slug-status" role="status" className="text-sm text-muted-foreground">
        {t(`pages.${status}`)}
      </p>
    </div>
  );
}
