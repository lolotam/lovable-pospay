import { createFileRoute, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { validSlug, pageText } from "@/modules/pages";
import { publicPageQuery } from "@/modules/pages/ui/page-query";
import { PublicPage } from "@/modules/pages/ui/public-page";
import { RouteNotFound, RouteError } from "@/modules/permissions/ui/route-feedback";
import { t } from "@/i18n";
export const Route = createFileRoute("/s/$slug")({
  validateSearch: (search: Record<string, unknown>): { lang?: string } => ({
    lang: typeof search["lang"] === "string" ? search["lang"] : "ar",
  }),
  loaderDeps: ({ search }) => ({ lang: search.lang === "en" ? ("en" as const) : ("ar" as const) }),
  loader: async ({ params, context, deps }) => {
    if (!validSlug(params.slug)) throw notFound();
    const page = await context.queryClient.fetchQuery(publicPageQuery(params.slug));
    if (!page) throw notFound();
    return { page, lang: deps.lang };
  },
  head: ({ loaderData, params }) => {
    const page = loaderData?.page,
      lang = loaderData?.lang ?? "ar",
      hero = page?.document.blocks.find((b) => b.type === "hero" && !b.hidden);
    const title = page
      ? hero?.type === "hero"
        ? pageText(hero.title, lang) || page.companyName
        : page.companyName
      : t("page.notFound");
    const description =
      hero?.type === "hero"
        ? pageText(hero.subtitle, lang)
        : (page?.companyName ?? t("page.notFoundBody"));
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
        { name: "robots", content: page ? "index,follow" : "noindex" },
      ],
      links: page
        ? [{ rel: "canonical", href: `https://app2.pospay.systems/s/${params.slug}` }]
        : [],
    };
  },
  notFoundComponent: RouteNotFound,
  errorComponent: RouteError,
  component: CompanyPage,
});
function CompanyPage() {
  const { slug } = Route.useParams(),
    { lang } = Route.useSearch(),
    navigate = Route.useNavigate(),
    { data } = useSuspenseQuery(publicPageQuery(slug));
  if (!data) return null;
  return (
    <PublicPage
      page={data}
      lang={lang === "en" ? "en" : "ar"}
      onLanguage={() => void navigate({ search: { lang: lang === "en" ? "ar" : "en" } })}
    />
  );
}
