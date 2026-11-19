import { ArrowUp, ArrowDown, Eye, EyeSlash, Trash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import type { PageBlock, PageDocument } from "../contracts";
export interface BlockListProps {
  document: PageDocument;
  selected: string | null;
  select: (id: string) => void;
  move: (id: string, d: -1 | 1) => void;
  toggle: (id: string) => void;
  remove: (id: string) => void;
}
export function BlockList({ document, selected, select, move, toggle, remove }: BlockListProps) {
  return (
    <ol className="space-y-2">
      {document.blocks.map((block, i) => (
        <li
          key={block.id}
          className={`flex flex-wrap items-center gap-1 rounded-lg border p-2 ${selected === block.id ? "border-primary bg-accent" : "border-border bg-card"}`}
        >
          <Button
            variant="ghost"
            className="min-h-11 min-w-0 flex-1 justify-start whitespace-normal"
            onClick={() => select(block.id)}
          >
            {i + 1}. {t(`pages.${block.type}`)}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="min-h-11 min-w-11"
            disabled={i === 0}
            aria-label={t("pages.up")}
            onClick={() => move(block.id, -1)}
          >
            <ArrowUp weight="duotone" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="min-h-11 min-w-11"
            disabled={i === document.blocks.length - 1}
            aria-label={t("pages.down")}
            onClick={() => move(block.id, 1)}
          >
            <ArrowDown weight="duotone" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="min-h-11 min-w-11"
            aria-label={t(block.hidden ? "pages.show" : "pages.hide")}
            onClick={() => toggle(block.id)}
          >
            {block.hidden ? <EyeSlash weight="duotone" /> : <Eye weight="duotone" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="min-h-11 min-w-11"
            aria-label={t("pages.remove")}
            onClick={() => remove(block.id)}
          >
            <Trash weight="duotone" />
          </Button>
        </li>
      ))}
    </ol>
  );
}
export interface AddBlocksProps {
  disabled: boolean;
  add: (type: PageBlock["type"]) => void;
}
export function AddBlocks({ disabled, add }: AddBlocksProps) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{t("pages.add")}</legend>
      <div className="flex flex-wrap gap-2">
        {(["hero", "about", "services", "branches", "contact", "cta", "gallery"] as const).map((type) => (
          <Button
            key={type}
            variant="outline"
            className="min-h-11"
            disabled={disabled}
            onClick={() => add(type)}
          >
            {t(`pages.${type}`)}
          </Button>
        ))}
      </div>
    </fieldset>
  );
}
