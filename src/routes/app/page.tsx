import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { savePageDraftFn, publishPageFn, unpublishPageFn, checkSlugFn } from "@/modules/pages";
import { PageEditor } from "@/modules/pages/ui/page-editor";
import { pageDraftQuery } from "@/modules/pages/ui/page-query";
import { RouteError } from "@/modules/permissions/ui/route-feedback";
import { t } from "@/i18n";
export const Route = createFileRoute("/app/page")({
  beforeLoad: ({ context }) => {
    const active = context.session.active;
    if (active?.kind !== "company" || active.role !== "owner") throw redirect({ to: "/app" });
    return { pageCompanyId: active.companyId };
  },
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(pageDraftQuery(context.pageCompanyId)),
  errorComponent: RouteError,
  head: () => ({
    meta: [
      { title: `${t("pages.title")} — PosPay` },
      { name: "description", content: t("pages.description") },
      { property: "og:title", content: `${t("pages.title")} — PosPay` },
      { property: "og:description", content: t("pages.description") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Editor,
});
function Editor() {
  const { pageCompanyId } = Route.useRouteContext(),
    cache = useQueryClient(),
    query = pageDraftQuery(pageCompanyId),
    { data } = useSuspenseQuery(query);
  const save = useServerFn(savePageDraftFn),
    publish = useServerFn(publishPageFn),
    unpublish = useServerFn(unpublishPageFn),
    check = useServerFn(checkSlugFn);
  return (
    <PageEditor
      initial={data}
      actions={{
        save: (input) => save({ data: input }),
        publish: (version) => publish({ data: { version } }),
        unpublish: () => unpublish(),
        check: (slug) => check({ data: { slug } }),
        reload: () => cache.fetchQuery(query),
      }}
    />
  );
}
