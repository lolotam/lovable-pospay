import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import type { PageDocument } from "../contracts";
import type { PageAsset } from "../ports/asset-repository";
import { referencedAssets } from "../domain/assets";
export interface AssetPickerProps {
  assets: PageAsset[];
  document: PageDocument;
  busy: boolean;
  onChange: (document: PageDocument) => void;
  remove: (id: string) => void;
}
export function AssetPicker({ assets, document, busy, onChange, remove }: AssetPickerProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {assets.map((asset) => (
        <article key={asset.id} className="min-w-0 space-y-2 rounded-lg border border-border p-3">
          <img
            src={`/media/${asset.id}`}
            alt={asset.alt.ar}
            className="aspect-square w-full object-contain"
          />
          <Button
            variant="outline"
            className="min-h-11 w-full whitespace-normal"
            aria-pressed={document.logoAssetId === asset.id}
            onClick={() =>
              onChange({
                ...document,
                logoAssetId: document.logoAssetId === asset.id ? null : asset.id,
              })
            }
          >
            {t("pages.logo")}
          </Button>
          <Button
            variant="outline"
            className="min-h-11 w-full whitespace-normal"
            aria-pressed={document.heroImageAssetId === asset.id}
            onClick={() =>
              onChange({
                ...document,
                heroImageAssetId: document.heroImageAssetId === asset.id ? null : asset.id,
              })
            }
          >
            {t("pages.heroImage")}
          </Button>
          <Button
            variant="outline"
            className="min-h-11 w-full whitespace-normal"
            disabled={busy || referencedAssets(document).includes(asset.id)}
            onClick={() => remove(asset.id)}
          >
            {t("pages.remove")}
          </Button>
        </article>
      ))}
    </div>
  );
}
