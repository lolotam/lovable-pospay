import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ReceptionQr } from "@/modules/attendance/ui/reception-qr";
import { t } from "@/i18n";

export const Route = createFileRoute("/reception/qr")({
  validateSearch: z.object({ branch: z.string().uuid().optional() }),
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
    <main className="flex min-h-screen items-center justify-center px-6 py-10">
      {branch ? <ReceptionQr branchId={branch} /> : <p>{t("qr.missingBranch")}</p>}
    </main>
  );
}
