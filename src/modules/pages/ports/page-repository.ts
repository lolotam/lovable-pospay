import type { PageDraftDto, SavePageInput, PublicPageDto } from "../contracts";
/** تخزين صفحة شركة ضمن معاملة المستخدم، وتفويض المالك قبل القراءة والكتابة. */
export interface PageRepository {
  isOwner(): Promise<boolean>;
  draft(): Promise<PageDraftDto>;
  save(input: SavePageInput): Promise<PageDraftDto>;
  publish(version: number): Promise<PageDraftDto>;
  unpublish(): Promise<PageDraftDto>;
  available(slug: string): Promise<boolean>;
  audit(
    action: "page.saved" | "page.published" | "page.unpublished",
    version: number,
  ): Promise<void>;
}
/** قراءة مجهولة لمستند منشور فقط، لا تحتوي مسودات أو هويات أعضاء. */
export interface PublicPageReader {
  read(slug: string): Promise<PublicPageDto | null>;
}
