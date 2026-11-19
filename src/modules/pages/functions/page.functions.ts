import { createServerFn } from "@tanstack/react-start";
import { savePageInput, pageVersionInput, pageSlugInput } from "../contracts";
import { getDraft, saveDraft, checkSlug } from "../use-cases/save-draft";
import { publishPage, unpublishPage, readPublicPage } from "../use-cases/publish-page";
import type { PageRepository } from "../ports/page-repository";
async function ownerRun<T>(run: (repo: PageRepository) => Promise<T>): Promise<T> {
  const { requireSession } = await import("@/lib/server/session.server");
  const { withUser } = await import("@/lib/server/db.server");
  const { pgPageRepository } = await import("../persistence/page.server");
  const { readWorkspaceCookie } = await import("@/modules/permissions/index.server");
  const { setResponseHeader } = await import("@tanstack/react-start/server");
  const { user } = await requireSession(),
    active = readWorkspaceCookie().remembered;
  if (active?.kind !== "company" || active.role !== "owner") throw new Error("FORBIDDEN");
  setResponseHeader("Cache-Control", "private, no-store");
  return withUser(user.id, (db) => run(pgPageRepository(db, active.companyId, user.id)));
}
export const getPageDraftFn = createServerFn({ method: "GET" }).handler(() => ownerRun(getDraft));
export const savePageDraftFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => savePageInput.parse(input))
  .handler(({ data }) => ownerRun((repo) => saveDraft(repo, data)));
export const checkSlugFn = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => pageSlugInput.parse(input))
  .handler(({ data }) => ownerRun((repo) => checkSlug(repo, data.slug)));
export const publishPageFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => pageVersionInput.parse(input))
  .handler(({ data }) => ownerRun((repo) => publishPage(repo, data.version)));
export const unpublishPageFn = createServerFn({ method: "POST" }).handler(() =>
  ownerRun(unpublishPage),
);
export const getPublicPageFn = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => pageSlugInput.parse(input))
  .handler(async ({ data }) => {
    const { withUser } = await import("@/lib/server/db.server");
    const { pgPublicPageReader } = await import("../persistence/page.server");
    const { setResponseHeader } = await import("@tanstack/react-start/server");
    setResponseHeader("Cache-Control", "no-store");
    return withUser("", (db) => readPublicPage(pgPublicPageReader(db), data.slug));
  });
