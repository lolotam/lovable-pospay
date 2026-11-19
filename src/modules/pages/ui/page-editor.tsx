import { useEffect, useState } from "react";
import { EditorFooter } from "./editor-footer";
import { BlockSheet } from "./block-sheet";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import type { PageDraftDto } from "../contracts";
import { BlockEditor } from "./block-editor";
import { BlockList, AddBlocks } from "./block-list";
import { SlugField } from "./slug-field";
import { PagePreview } from "./page-preview";
import { usePageEditor, type PageEditorActions } from "./use-page-editor";
export interface PageEditorProps {
  initial: PageDraftDto;
  actions: PageEditorActions;
}
export function PageEditor({ initial, actions }: PageEditorProps) {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const editor = usePageEditor(initial, actions);
  const block = editor.document.blocks.find((b) => b.id === editor.selected);
  return (
    <main className="mx-auto max-w-6xl px-4 py-6 pb-40 sm:px-6">
      <h1 className="mb-5 text-3xl">{t("pages.title")}</h1>
      <EditorBody editor={editor} />
      <EditorFooter editor={editor} />
      <BlockSheet
        block={block}
        open={!!block && editor.mobile === "edit" && !desktop}
        close={() => editor.setSelected(null)}
        replace={editor.replace}
      />
    </main>
  );
}

function EditorBody({ editor }: { editor: ReturnType<typeof usePageEditor> }) {
  const block = editor.document.blocks.find((b) => b.id === editor.selected);
  return (
    <>
      <div className="mb-4 flex gap-2 lg:hidden">
        {(["edit", "preview"] as const).map((tab) => (
          <Button
            key={tab}
            variant={editor.mobile === tab ? "default" : "outline"}
            className="min-h-11"
            onClick={() => editor.setMobile(tab)}
          >
            {t(`pages.${tab}`)}
          </Button>
        ))}
      </div>
      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <div
          className={`min-w-0 space-y-5 ${editor.mobile === "preview" ? "hidden lg:block" : ""}`}
        >
          <SlugField
            value={editor.slug}
            onChange={editor.setSlug}
            check={editor.check}
            onValidity={editor.setValid}
          />
          <AddBlocks
            disabled={editor.document.blocks.length >= 12 || editor.busy}
            add={editor.add}
          />
          <BlockList
            document={editor.document}
            selected={editor.selected}
            select={editor.setSelected}
            move={editor.move}
            toggle={editor.toggle}
            remove={editor.remove}
          />
          <div className="hidden lg:block">
            {block && (
              <section className="space-y-4 border-t border-border pt-5">
                <h2 className="text-xl">{t(`pages.${block.type}`)}</h2>
                <BlockEditor block={block} onChange={editor.replace} />
              </section>
            )}
          </div>
        </div>
        <div
          className={`min-w-0 overflow-hidden border border-border lg:sticky lg:top-6 lg:self-start ${editor.mobile === "edit" ? "hidden lg:block" : ""}`}
        >
          <PagePreview draft={editor.draft} document={editor.document} />
        </div>
      </div>
    </>
  );
}
