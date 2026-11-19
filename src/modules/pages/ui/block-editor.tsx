import { GalleryEditor } from "./gallery-editor";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { t, type MessageKey } from "@/i18n";
import type { PageBlock, LocalizedText } from "../contracts";
export interface TextFieldsProps {
  label: MessageKey;
  value: LocalizedText;
  max: number;
  onChange: (v: LocalizedText) => void;
}
function TextFields({ label, value, max, onChange }: TextFieldsProps) {
  return (
    <fieldset className="space-y-2">
      <legend className="font-medium">{t(label)}</legend>
      <div className="grid gap-3 md:grid-cols-2">
        {(["ar", "en"] as const).map((lang) => (
          <label key={lang} className="grid gap-1 text-sm">
            {t(lang === "ar" ? "pages.ar" : "pages.en")}
            {max > 200 ? (
              <Textarea
                dir={lang === "ar" ? "rtl" : "ltr"}
                value={value[lang]}
                maxLength={max}
                onChange={(e) => onChange({ ...value, [lang]: e.target.value })}
              />
            ) : (
              <Input
                className="min-h-11"
                dir={lang === "ar" ? "rtl" : "ltr"}
                value={value[lang]}
                maxLength={max}
                onChange={(e) => onChange({ ...value, [lang]: e.target.value })}
              />
            )}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
export interface BlockEditorProps {
  block: PageBlock;
  onChange: (block: PageBlock) => void;
}
export function BlockEditor({ block, onChange }: BlockEditorProps) {
  if (block.type === "gallery") return <GalleryEditor block={block} onChange={onChange} />;
  if (block.type === "hero")
    return (
      <div className="space-y-4">
        <TextFields
          label="pages.heading"
          value={block.title}
          max={80}
          onChange={(title) => onChange({ ...block, title })}
        />
        <TextFields
          label="pages.subtitle"
          value={block.subtitle}
          max={160}
          onChange={(subtitle) => onChange({ ...block, subtitle })}
        />
      </div>
    );
  if (block.type === "about")
    return (
      <TextFields
        label="pages.body"
        value={block.body}
        max={1000}
        onChange={(body) => onChange({ ...block, body })}
      />
    );
  if (block.type === "services")
    return (
      <label className="flex min-h-11 items-center justify-between gap-3">
        {t("pages.showPrices")}
        <Switch
          checked={block.showPrices}
          onCheckedChange={(showPrices) => onChange({ ...block, showPrices })}
        />
      </label>
    );
  if (block.type === "branches") return <BranchFields block={block} onChange={onChange} />;
  if (block.type === "contact")
    return (
      <div className="space-y-3">
        {(["whatsapp", "phone", "instagram"] as const).map((key) => (
          <label key={key} className="grid gap-1 text-sm">
            {t(`pages.${key}`)}
            <Input
              className="min-h-11"
              dir="ltr"
              value={block[key]}
              maxLength={key === "instagram" ? 30 : 15}
              inputMode={key === "instagram" ? "text" : "numeric"}
              onChange={(e) => onChange({ ...block, [key]: e.target.value })}
            />
          </label>
        ))}
      </div>
    );
  return (
    <div className="space-y-4">
      <TextFields
        label="pages.label"
        value={block.label}
        max={40}
        onChange={(label) => onChange({ ...block, label })}
      />
      <TextFields
        label="pages.message"
        value={block.message}
        max={200}
        onChange={(message) => onChange({ ...block, message })}
      />
    </div>
  );
}
function BranchFields({
  block,
  onChange,
}: {
  block: Extract<PageBlock, { type: "branches" }>;
  onChange: (block: PageBlock) => void;
}) {
  const change = (i: number, value: (typeof block.items)[number]) =>
    onChange({ ...block, items: block.items.map((b, j) => (j === i ? value : b)) });
  return (
    <div className="space-y-5">
      {block.items.map((branch, i) => (
        <fieldset key={i} className="space-y-3 border-b border-border pb-4">
          <TextFields
            label="pages.name"
            value={branch.name}
            max={80}
            onChange={(name) => change(i, { ...branch, name })}
          />
          <TextFields
            label="pages.address"
            value={branch.address}
            max={200}
            onChange={(address) => change(i, { ...branch, address })}
          />
          <TextFields
            label="pages.hours"
            value={branch.hours}
            max={200}
            onChange={(hours) => change(i, { ...branch, hours })}
          />
          <label className="grid gap-1 text-sm">
            {t("pages.map")}
            <Input
              className="min-h-11"
              dir="ltr"
              type="url"
              value={branch.mapUrl}
              onChange={(e) => change(i, { ...branch, mapUrl: e.target.value })}
            />
          </label>
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() => onChange({ ...block, items: block.items.filter((_, j) => i !== j) })}
          >
            {t("pages.remove")}
          </Button>
        </fieldset>
      ))}
      <Button
        variant="outline"
        className="min-h-11"
        disabled={block.items.length >= 10}
        onClick={() =>
          onChange({
            ...block,
            items: [
              ...block.items,
              {
                name: { ar: "", en: "" },
                address: { ar: "", en: "" },
                hours: { ar: "", en: "" },
                mapUrl: "",
              },
            ],
          })
        }
      >
        {t("pages.addBranch")}
      </Button>
    </div>
  );
}
