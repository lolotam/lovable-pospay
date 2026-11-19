import { t, type Locale } from "@/i18n";
import { Button } from "@/components/ui/button";
import type { PublicPageDto } from "../contracts";
import { visibleBlocks } from "../domain/page-document";
import { ContentBlock } from "./blocks/content-block";
export interface PublicPageProps {
  page: PublicPageDto;
  lang: Locale;
  onLanguage?: () => void;
}
export function PublicPage({ page, lang, onLanguage }: PublicPageProps) {
  const blocks = visibleBlocks(page.document),
    contact = blocks.find((b) => b.type === "contact"),
    whatsapp = contact?.type === "contact" ? contact.whatsapp : "";
  return (
    <main
      dir={lang === "ar" ? "rtl" : "ltr"}
      lang={lang}
      className="min-w-0 bg-background text-foreground"
    >
      <header className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-5 py-4">
        {page.document.logoAssetId && <img src={`/media/${page.document.logoAssetId}`} alt={page.companyName} className="h-12 w-12 shrink-0 object-contain" />}
        <span className="font-display text-xl break-words">{page.companyName}</span>
        {onLanguage && (
          <Button variant="outline" className="min-h-11" onClick={onLanguage}>
            {t("pages.language", lang)}
          </Button>
        )}
      </header>
      {blocks.map((block) => (
        <ContentBlock key={block.id} block={block} page={page} lang={lang} whatsapp={whatsapp} />
      ))}
    </main>
  );
}
