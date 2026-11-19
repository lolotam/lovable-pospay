import type { PageRepository } from "../ports/page-repository";
import type { SavePageInput } from "../contracts";
export async function getDraft(repo: PageRepository) {
  await assertOwner(repo);
  return repo.draft();
}
export async function assertOwner(repo: PageRepository) {
  if (!(await repo.isOwner())) throw new Error("FORBIDDEN");
}
export async function saveDraft(repo: PageRepository, input: SavePageInput) {
  await assertOwner(repo);
  const result = await repo.save(input);
  await repo.audit("page.saved", result.version);
  return result;
}
export async function checkSlug(repo: PageRepository, slug: string) {
  await assertOwner(repo);
  return repo.available(slug);
}
