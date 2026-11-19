import { useState } from "react";
import type { PageDraftDto, PageDocument, SavePageInput, PageBlock } from "../contracts";
import { pageDocumentSchema } from "../contracts";
import { addBlock, moveBlock, toggleBlock, visibleBlocks } from "../domain/page-document";
import { executePageAction } from "./execute-page-action";
import type { MessageKey } from "@/i18n";
export interface PageEditorActions {
  save: (input: SavePageInput) => Promise<PageDraftDto>;
  publish: (version: number) => Promise<PageDraftDto>;
  unpublish: () => Promise<PageDraftDto>;
  reload: () => Promise<PageDraftDto>;
  check: (slug: string) => Promise<boolean>;
}
export function usePageEditor(initial: PageDraftDto, actions: PageEditorActions) {
  const [draft, setDraft] = useState(initial),
    [document, setDocument] = useState<PageDocument>(initial.document),
    [slug, setSlug] = useState(initial.slug),
    [selected, setSelected] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [valid, setValid] = useState(false),
    [message, setMessage] = useState<MessageKey | null>(null),
    [mobile, setMobile] = useState<"edit" | "preview">("edit");
  const dirty = slug !== draft.slug || JSON.stringify(document) !== JSON.stringify(draft.document);
  const updateDraft = (next: PageDraftDto) => {
    setDraft(next);
    setDocument(next.document);
    setSlug(next.slug);
  };
  const execute = async (kind: "save" | "publish" | "unpublish") => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      updateDraft(await executePageAction({ kind, draft, document, slug, dirty, actions }));
      setMessage("pages.saved");
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === "PAGE_CONFLICT") {
        try {
          updateDraft(await actions.reload());
          setMessage("pages.conflict");
        } catch {
          setMessage("pages.failed");
        }
      } else
        setMessage(
          code === "SLUG_TAKEN"
            ? "pages.taken"
            : code === "PAGE_EMPTY"
              ? "pages.empty"
              : "pages.failed",
        );
    } finally {
      setBusy(false);
    }
  };
  const add = (type: PageBlock["type"]) => {
    const id = crypto.randomUUID();
    setDocument((doc) => addBlock(doc, type, id));
    setSelected(id);
  };
  const replace = (block: PageBlock) =>
    setDocument((doc) => ({ blocks: doc.blocks.map((b) => (b.id === block.id ? block : b)) }));
  const check = actions.check;
  return {
    draft,
    document,
    slug,
    setSlug,
    selected,
    setSelected,
    busy,
    valid,
    setValid,
    message,
    mobile,
    setMobile,
    dirty,
    execute,
    add,
    replace,
    check,
    canPublish:
      visibleBlocks(document).length > 0 && valid && pageDocumentSchema.safeParse(document).success,
    move: (id: string, d: -1 | 1) => setDocument((doc) => moveBlock(doc, id, d)),
    toggle: (id: string) => setDocument((doc) => toggleBlock(doc, id)),
    remove: (id: string) => {
      setDocument((doc) => ({ blocks: doc.blocks.filter((b) => b.id !== id) }));
      if (selected === id) setSelected(null);
    },
  };
}
