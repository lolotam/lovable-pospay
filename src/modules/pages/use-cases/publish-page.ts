import type { PageRepository, PublicPageReader } from "../ports/page-repository";
import { assertOwner } from "./save-draft";
import { assertPublishable } from "../domain/page-document";
export async function publishPage(repo: PageRepository, version: number) {
  await assertOwner(repo);
  const draft = await repo.draft();
  if (draft.version !== version) throw new Error("PAGE_CONFLICT");
  assertPublishable(draft.document);
  const result = await repo.publish(version);
  await repo.audit("page.published", result.version);
  return result;
}
export async function unpublishPage(repo: PageRepository) {
  await assertOwner(repo);
  const result = await repo.unpublish();
  await repo.audit("page.unpublished", result.version);
  return result;
}
export function readPublicPage(repo: PublicPageReader, slug: string) {
  return repo.read(slug);
}
