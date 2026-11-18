import { createFileRoute } from "@tanstack/react-router";
import { receptionQrSearchSchema } from "@/modules/attendance";
import { ReceptionQr } from "@/modules/attendance/ui/reception-qr";
import { t } from "@/i18n";

export const Route = createFileRoute("/reception/qr")({
  validateSearch: receptionQrSearchSchema,
  ssr: false,
  head: () => ({
    meta: [
      { title: "كود الحضور — PosPay" },
      { name: "description", content: "شاشة كود الحضور عند استقبال الصالون." },
      { property: "og:title", content: "كود الحضور — PosPay" },
      { property: "og:description", content: "شاشة كود الحضور عند استقبال الصالون." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReceptionQrPage,
});

function ReceptionQrPage() {
  const { branch } = Route.useSearch();
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-6 sm:px-6 sm:py-10">
      {branch ? <ReceptionQr branchId={branch} /> : <p>{t("qr.missingBranch")}</p>}
    </main>
  );
}
