import { createServerFn } from "@tanstack/react-start";
import { savePageInput, pageVersionInput, pageSlugInput } from "../contracts";
import { getDraft, saveDraft, checkSlug } from "../use-cases/save-draft";
import { publishPage, unpublishPage, readPublicPage } from "../use-cases/publish-page";
export const getPageDraftFn = createServerFn({ method: "GET" }).handler(async () => {
  const { ownerRun } = await import("../persistence/owner-run.server");
  return ownerRun(getDraft);
});
export const savePageDraftFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => savePageInput.parse(input))
  .handler(async ({ data }) => {
    const { ownerRun } = await import("../persistence/owner-run.server");
    return ownerRun((repo) => saveDraft(repo, data));
  });
export const checkSlugFn = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => pageSlugInput.parse(input))
  .handler(async ({ data }) => {
    const { ownerRun } = await import("../persistence/owner-run.server");
    return ownerRun((repo) => checkSlug(repo, data.slug));
  });
export const publishPageFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => pageVersionInput.parse(input))
  .handler(async ({ data }) => {
    const { ownerRun } = await import("../persistence/owner-run.server");
    return ownerRun((repo) => publishPage(repo, data.version));
  });
export const unpublishPageFn = createServerFn({ method: "POST" }).handler(async () => {
  const { ownerRun } = await import("../persistence/owner-run.server");
  return ownerRun(unpublishPage);
});
export const getPublicPageFn = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => pageSlugInput.parse(input))
  .handler(async ({ data }) => {
    const { withUser } = await import("@/lib/server/db.server");
    const { pgPublicPageReader } = await import("../persistence/page.server");
    const { setResponseHeader } = await import("@tanstack/react-start/server");
    setResponseHeader("Cache-Control", "no-store");
    return withUser("", (db) => readPublicPage(pgPublicPageReader(db), data.slug));
  });
