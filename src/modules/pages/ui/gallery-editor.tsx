import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";
import { getPageAssetsFn } from "../functions/assets.functions";
import type { PageBlock } from "../contracts";
export interface GalleryEditorProps {
  block: Extract<PageBlock, { type: "gallery" }>;
  onChange: (block: PageBlock) => void;
}
export function GalleryEditor({ block, onChange }: GalleryEditorProps) {
  const list = useServerFn(getPageAssetsFn);
  const { data } = useQuery({ queryKey: ["page-assets"], queryFn: () => list() });
  return (
    <div className="space-y-4">
      {block.images.map((image, index) => (
        <GalleryImage
          key={`${image.assetId}-${index}`}
          image={image}
          change={(next) =>
            onChange({
              ...block,
              images: block.images.map((item, i) => (i === index ? next : item)),
            })
          }
          remove={() => onChange({ ...block, images: block.images.filter((_, i) => i !== index) })}
        />
      ))}
      <div className="grid grid-cols-3 gap-2">
        {data?.enabled &&
          data.assets.map((asset) => (
            <Button
              key={asset.id}
              variant="outline"
              className="h-24"
              aria-label={t("pages.addImage")}
              disabled={
                block.images.length >= 6 || block.images.some((i) => i.assetId === asset.id)
              }
              onClick={() =>
                onChange({
                  ...block,
                  images: [...block.images, { assetId: asset.id, alt: asset.alt }],
                })
              }
            >
              <img
                src={`/media/${asset.id}`}
                alt={asset.alt.ar}
                className="h-full w-full object-contain"
              />
            </Button>
          ))}
      </div>
    </div>
  );
}

interface GalleryImageProps {
  image: Extract<PageBlock, { type: "gallery" }>["images"][number];
  change: (image: GalleryImageProps["image"]) => void;
  remove: () => void;
}
function GalleryImage({ image, change, remove }: GalleryImageProps) {
  return (
    <fieldset className="space-y-2">
      <img
        src={`/media/${image.assetId}`}
        alt={image.alt.ar}
        className="h-32 w-full object-contain"
      />
      {(["ar", "en"] as const).map((lang) => (
        <label key={lang} className="grid gap-1">
          {t(lang === "ar" ? "pages.altAr" : "pages.altEn")}
          <Input
            value={image.alt[lang]}
            maxLength={200}
            dir={lang === "ar" ? "rtl" : "ltr"}
            onChange={(e) => change({ ...image, alt: { ...image.alt, [lang]: e.target.value } })}
          />
        </label>
      ))}
      <Button variant="outline" className="min-h-11" onClick={remove}>
        {t("pages.remove")}
      </Button>
    </fieldset>
  );
}
