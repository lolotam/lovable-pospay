import type { PageDraftDto, PageDocument } from "../contracts";
import type { Locale } from "@/i18n";
import { PublicPage } from "./public-page";
export interface PagePreviewProps {
  draft: PageDraftDto;
  document: PageDocument;
  lang?: Locale;
}
export function PagePreview({ draft, document, lang = "ar" }: PagePreviewProps) {
  return (
    <PublicPage
      page={{
        companyName: draft.companyName,
        currency: draft.currency,
        services: draft.services,
        document,
      }}
      lang={lang}
    />
  );
}
