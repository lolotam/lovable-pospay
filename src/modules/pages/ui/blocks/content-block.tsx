import { Button } from "@/components/ui/button";
import { t, type Locale } from "@/i18n";
import { formatKwd } from "@/shared/kernel/money";
import { pageText } from "../../domain/page-document";
import type { PageBlock, PublicPageDto } from "../../contracts";
export interface ContentBlockProps {
  block: PageBlock;
  page: PublicPageDto;
  lang: Locale;
  whatsapp: string;
}
export function ContentBlock({ block, page, lang, whatsapp }: ContentBlockProps) {
  if (block.type === "hero")
    return (
      <section className="tile-hem bg-tile-teal text-tile-teal-foreground px-5 py-12 sm:px-8 sm:py-16">
        <div className="mx-auto max-w-4xl">
          {page.document.heroImageAssetId && <img src={`/media/${page.document.heroImageAssetId}`} alt={page.companyName} className="mb-6 aspect-video w-full object-cover" />}
          <p className="mb-3 text-sm">{page.companyName}</p>
          <h1 className="text-4xl break-words sm:text-5xl">
            {pageText(block.title, lang) || page.companyName}
          </h1>
          <p className="mt-4 max-w-2xl whitespace-pre-wrap break-words">
            {pageText(block.subtitle, lang)}
          </p>
        </div>
      </section>
    );
  if (block.type === "about" || block.type === "services") return <InfoBlock block={block} page={page} lang={lang} />;
  if (block.type === "branches" || block.type === "contact") return <DetailsBlock block={block} lang={lang} />;
  if (block.type === "gallery") return <section className="mx-auto grid max-w-4xl gap-4 px-5 py-10 sm:grid-cols-2 lg:grid-cols-3">
    {block.images.map((image, index) => <img key={`${image.assetId}-${index}`} src={`/media/${image.assetId}`} alt={pageText(image.alt, lang)} loading="lazy" className="aspect-square w-full object-cover" />)}
  </section>;
  return (
    <section className="mx-auto max-w-4xl px-5 py-10">
      {whatsapp && (
        <Button asChild className="min-h-11 max-w-full whitespace-normal">
          <a
            href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(pageText(block.message, lang))}`}
          >
            {pageText(block.label, lang) || t("pages.whatsapp", lang)}
          </a>
        </Button>
      )}
    </section>
  );
}

function DetailsBlock({ block, lang }: { block: Extract<PageBlock, { type: "branches" | "contact" }>; lang: Locale }) {
  if (block.type === "branches")
    return (
      <section className="mx-auto max-w-4xl px-5 py-10">
        <h2 className="mb-5 text-2xl">{t("pages.branches", lang)}</h2>
        <div className="grid gap-6 md:grid-cols-2">
          {block.items.map((branch, i) => (
            <article key={i} className="space-y-2 border-s-2 border-primary ps-4">
              <h3 className="text-xl break-words">{pageText(branch.name, lang)}</h3>
              <p className="whitespace-pre-wrap break-words">{pageText(branch.address, lang)}</p>
              <p className="whitespace-pre-wrap break-words text-muted-foreground">
                {pageText(branch.hours, lang)}
              </p>
              {branch.mapUrl && (
                <a
                  href={branch.mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center text-primary underline"
                >
                  {t("pages.openMap", lang)}
                </a>
              )}
            </article>
          ))}
        </div>
      </section>
    );
  if (block.type === "contact")
    return (
      <section className="bg-accent px-5 py-10">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-4">
          <h2 className="w-full text-2xl">{t("pages.contact", lang)}</h2>
          {block.whatsapp && (
            <Button asChild className="min-h-11">
              <a href={`https://wa.me/${block.whatsapp}`}>{t("pages.whatsapp", lang)}</a>
            </Button>
          )}
          {block.phone && (
            <Button asChild variant="outline" className="min-h-11">
              <a href={`tel:+${block.phone}`}>{t("pages.call", lang)}</a>
            </Button>
          )}
          {block.instagram && (
            <a
              href={`https://www.instagram.com/${block.instagram}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center text-primary underline"
            >
              {block.instagram}
            </a>
          )}
        </div>
      </section>
    );
  return null;
}

function InfoBlock({ block, page, lang }: { block: Extract<PageBlock, { type: "about" | "services" }>; page: PublicPageDto; lang: Locale }) {
  if (block.type === "about")
    return (
      <section className="mx-auto max-w-4xl px-5 py-10">
        <h2 className="mb-4 text-2xl">{t("pages.about", lang)}</h2>
        <p className="whitespace-pre-wrap break-words">{pageText(block.body, lang)}</p>
      </section>
    );
  if (block.type === "services")
    return (
      <section className="bg-muted px-5 py-10">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-5 text-2xl">{t("pages.services", lang)}</h2>
          {!page.services.length && <p>{t("pages.noServices", lang)}</p>}
          <ul className="divide-y divide-border">
            {page.services.map((service) => (
              <li key={service.id} className="flex flex-wrap justify-between gap-3 py-4">
                <span className="break-words">{service.name}</span>
                {block.showPrices && (
                  <span className="tabular-nums">
                    {formatKwd(BigInt(service.priceMills))} {page.currency}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>
    );
  return null;
}
