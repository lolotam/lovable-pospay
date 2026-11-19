import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AssetPicker } from "./asset-picker";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";
import {
  getPageAssetsFn,
  uploadPageAssetFn,
  deletePageAssetFn,
} from "../functions/assets.functions";
import type { PageDocument } from "../contracts";
export interface AssetLibraryProps {
  document: PageDocument;
  onChange: (doc: PageDocument) => void;
  onEnabled?: (enabled: boolean) => void;
}
export function AssetLibrary({ document, onChange, onEnabled }: AssetLibraryProps) {
  const list = useServerFn(getPageAssetsFn),
    upload = useServerFn(uploadPageAssetFn),
    remove = useServerFn(deletePageAssetFn);
  const query = useQuery({ queryKey: ["page-assets"], queryFn: () => list() });
  useEffect(() => {
    onEnabled?.(query.data?.enabled === true);
  }, [onEnabled, query.data?.enabled]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const [alt, setAlt] = useState({ ar: "", en: "" });
  const mutate = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(false);
    try {
      await action();
      await query.refetch();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  if (!query.data?.enabled) return null;
  return (
    <section className="space-y-3 border-t border-border pt-4">
      <h2 className="text-xl">{t("pages.images")}</h2>
      <AltFields alt={alt} change={setAlt} />
      <UploadField
        disabled={busy || query.data.assets.length >= 20}
        upload={(file) => {
          const data = new FormData();
          data.set("file", file);
          data.set("alt", JSON.stringify(alt));
          void mutate(() => upload({ data }));
        }}
      />
      {error && <p role="alert">{t("pages.imageFailed")}</p>}
      <AssetPicker
        assets={query.data.assets}
        document={document}
        busy={busy}
        onChange={onChange}
        remove={(id) => void mutate(() => remove({ data: { id } }))}
      />
    </section>
  );
}
interface AltFieldsProps {
  alt: { ar: string; en: string };
  change: (alt: AltFieldsProps["alt"]) => void;
}
function AltFields({ alt, change }: AltFieldsProps) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {(["ar", "en"] as const).map((lang) => (
        <label key={lang} className="grid gap-1">
          {t(lang === "ar" ? "pages.altAr" : "pages.altEn")}
          <Input
            value={alt[lang]}
            maxLength={200}
            dir={lang === "ar" ? "rtl" : "ltr"}
            onChange={(e) => change({ ...alt, [lang]: e.target.value })}
          />
        </label>
      ))}
    </div>
  );
}

interface UploadFieldProps {
  disabled: boolean;
  upload: (file: File) => void;
}
function UploadField({ disabled, upload }: UploadFieldProps) {
  return (
    <label className="grid gap-2">
      {t("pages.upload")}
      <Input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          upload(file);
          e.target.value = "";
        }}
      />
    </label>
  );
}
