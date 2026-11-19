import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";
import { getPageAssetsFn, uploadPageAssetFn, deletePageAssetFn } from "../functions/assets.functions";
import type { PageDocument } from "../contracts";
import { referencedAssets } from "../domain/assets";
export interface AssetLibraryProps {
  document: PageDocument;
  onChange: (doc: PageDocument) => void;
}
export function AssetLibrary({ document, onChange }: AssetLibraryProps) {
  const list = useServerFn(getPageAssetsFn), upload = useServerFn(uploadPageAssetFn), remove = useServerFn(deletePageAssetFn);
  const query = useQuery({ queryKey: ["page-assets"], queryFn: () => list() });
  const [busy, setBusy] = useState(false), [error, setError] = useState(false);
  const mutate = async (action: () => Promise<unknown>) => {
    setBusy(true); setError(false);
    try { await action(); await query.refetch(); } catch { setError(true); } finally { setBusy(false); }
  };
  if (!query.data?.enabled) return null;
  return <section className="space-y-3 border-t border-border pt-4">
    <h2 className="text-xl">{t("pages.images")}</h2>
    <label className="grid gap-2">{t("pages.upload")}
      <Input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy || query.data.assets.length >= 20}
        onChange={e => { const file = e.target.files?.[0]; if (!file) return;
          const data = new FormData(); data.set("file", file); data.set("alt", JSON.stringify({ ar: "", en: "" }));
          void mutate(() => upload({ data })); e.target.value = "";
        }} />
    </label>
    {error && <p role="alert">{t("pages.imageFailed")}</p>}
    <div className="grid grid-cols-2 gap-3">
      {query.data.assets.map(asset => <article key={asset.id} className="min-w-0 space-y-2 rounded-lg border border-border p-3">
        <img src={`/media/${asset.id}`} alt={asset.alt.ar} className="aspect-square w-full object-contain" />
        <Button variant="outline" className="min-h-11 w-full" onClick={() => onChange({ ...document, logoAssetId: document.logoAssetId === asset.id ? null : asset.id })}>{t("pages.logo")}</Button>
        <Button variant="outline" className="min-h-11 w-full" onClick={() => onChange({ ...document, heroImageAssetId: document.heroImageAssetId === asset.id ? null : asset.id })}>{t("pages.heroImage")}</Button>
        <Button variant="outline" className="min-h-11 w-full" disabled={busy || referencedAssets(document).includes(asset.id)} onClick={() => void mutate(() => remove({ data: { id: asset.id } }))}>{t("pages.remove")}</Button>
      </article>)}
    </div>
  </section>;
}
