import { expect, it, vi } from "vitest";
import { saveDraft, getDraft } from "./save-draft";
import { publishPage } from "./publish-page";
import type { PageRepository } from "../ports/page-repository";
const draft = {
  slug: "glow-salon",
  document: { blocks: [] },
  version: 1,
  publishedAt: null,
  companyName: "Glow",
  currency: "KWD",
  services: [],
};
const repo: PageRepository = {
  isOwner: async () => true,
  draft: async () => draft,
  save: async () => draft,
  publish: vi.fn(async () => draft),
  unpublish: async () => draft,
  available: async () => true,
  audit: vi.fn(async () => {}),
};
it("non-owner cannot read or save", async () => {
  const denied = { ...repo, isOwner: async () => false };
  await expect(getDraft(denied)).rejects.toThrow("FORBIDDEN");
  await expect(
    saveDraft(denied, { slug: "glow-salon", document: { blocks: [] }, version: 1 }),
  ).rejects.toThrow("FORBIDDEN");
});
it("stale publication is refused", async () => {
  await expect(publishPage(repo, 2)).rejects.toThrow("PAGE_CONFLICT");
});
it("empty publication is refused", async () => {
  await expect(publishPage(repo, 1)).rejects.toThrow("PAGE_EMPTY");
});
it("save writes one audit after successful persistence", async () => {
  await saveDraft(repo, { slug: "glow-salon", document: { blocks: [] }, version: 1 });
  expect(repo.audit).toHaveBeenCalledWith("page.saved", 1);
});
