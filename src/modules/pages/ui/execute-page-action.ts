import { pageDocumentSchema, type PageDraftDto, type PageDocument } from "../contracts";
import type { PageEditorActions } from "./use-page-editor";
export interface PageActionInput {
  kind: "save" | "publish" | "unpublish";
  draft: PageDraftDto;
  document: PageDocument;
  slug: string;
  dirty: boolean;
  actions: PageEditorActions;
}
export async function executePageAction({
  kind,
  draft,
  document,
  slug,
  dirty,
  actions,
}: PageActionInput): Promise<PageDraftDto> {
  let next = draft;
  if (kind !== "unpublish" && (dirty || draft.version === 0))
    next = await actions.save({
      slug,
      document: pageDocumentSchema.parse(document),
      version: draft.version,
    });
  if (kind === "publish") next = await actions.publish(next.version);
  if (kind === "unpublish") next = await actions.unpublish();
  return next;
}
