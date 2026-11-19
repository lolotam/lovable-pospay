import * as Dialog from "@radix-ui/react-dialog";
import { X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import type { PageBlock } from "../contracts";
import { BlockEditor } from "./block-editor";
export interface BlockSheetProps {
  block: PageBlock | undefined;
  open: boolean;
  close: () => void;
  replace: (block: PageBlock) => void;
}
export function BlockSheet({ block, open, close, replace }: BlockSheetProps) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-foreground/40" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto border-t border-border bg-background p-5 pb-8"
        >
          <div className="mb-5 flex items-center justify-between gap-3">
            <Dialog.Title className="text-xl">
              {block ? t(`pages.${block.type}`) : t("pages.edit")}
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button
                className="min-h-11 min-w-11"
                size="icon"
                variant="ghost"
                aria-label={t("pages.close")}
              >
                <X weight="duotone" />
              </Button>
            </Dialog.Close>
          </div>
          {block && <BlockEditor block={block} onChange={replace} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
