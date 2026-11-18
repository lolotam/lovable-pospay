import { pageAllowed } from "@/modules/permissions/ui/area-guard";
import { NoAccess } from "@/modules/permissions/ui/no-access";
import { RouteError, RouteNotFound } from "@/modules/permissions/ui/route-feedback";
import { createFileRoute } from "@tanstack/react-router";
import { receptionQrSearchSchema } from "@/modules/attendance";
import { ReceptionQr } from "@/modules/attendance/ui/reception-qr";
import { t } from "@/i18n";
import { z } from "zod";

export const Route = createFileRoute("/pos/qr")({
  validateSearch: z.object({ branch: z.string().optional() }),
  ssr: false,
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
  head: () => ({
    meta: [
      { title: t("qr.metaTitle") },
      { name: "description", content: t("qr.metaDescription") },
      { property: "og:title", content: t("qr.metaTitle") },
      { property: "og:description", content: t("qr.metaDescription") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: GuardedPage,
});

function ReceptionQrPage() {
  const { branch } = receptionQrSearchSchema.parse(Route.useSearch());
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-6 sm:px-6 sm:py-10">
      {branch ? <ReceptionQr branchId={branch} /> : <p>{t("qr.missingBranch")}</p>}
    </main>
  );
}

function GuardedPage() {
  const { session, allowed } = Route.useRouteContext();
  return allowed && pageAllowed(session, "/pos/qr") ? (
    <ReceptionQrPage />
  ) : (
    <NoAccess workspace={session.active} />
  );
}
