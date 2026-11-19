import { queryOptions } from "@tanstack/react-query";
import { getPageDraftFn, getPublicPageFn } from "../functions/page.functions";
export const pageDraftQuery = (companyId: string) =>
  queryOptions({ queryKey: ["page-draft", companyId], queryFn: () => getPageDraftFn() });
export const publicPageQuery = (slug: string) =>
  queryOptions({
    queryKey: ["public-page", slug],
    queryFn: () => getPublicPageFn({ data: { slug } }),
    staleTime: 0,
  });
