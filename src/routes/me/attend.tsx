import { pageAllowed } from "@/modules/permissions/ui/area-guard";
import { NoAccess } from "@/modules/permissions/ui/no-access";
import { RouteError, RouteNotFound } from "@/modules/permissions/ui/route-feedback";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AttendScan } from "@/modules/attendance/ui/attend-scan";
import { t } from "@/i18n";

export const Route = createFileRoute("/me/attend")({
  validateSearch: z.object({ t: z.string().optional() }),
  ssr: false,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
  head: () => ({
    meta: [
      { title: "الحضور والانصراف — PosPay" },
      { name: "description", content: "تسجيل حضور وانصراف الموظفة من تليفونها." },
      { property: "og:title", content: "الحضور والانصراف — PosPay" },
      { property: "og:description", content: "تسجيل حضور وانصراف الموظفة من تليفونها." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: GuardedPage,
});

function AttendPage() {
  const { t: token } = Route.useSearch();
  return (
    <main className="mx-auto max-w-sm px-4 py-8 sm:px-6 sm:py-16">
      <h1 className="mb-8 text-2xl font-bold">{t("attend.title")}</h1>
      {token ? (
        <AttendScan token={token} />
      ) : (
        <p className="text-destructive">{t("attend.invalidQr")}</p>
      )}
    </main>
  );
}

function GuardedPage() {
  const { session } = Route.useRouteContext();
  return pageAllowed(session, "/me/attend") ? (
    <AttendPage />
  ) : (
    <NoAccess workspace={session.active} />
  );
}
