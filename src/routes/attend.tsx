import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AttendScan } from "@/modules/attendance/ui/attend-scan";
import { t } from "@/i18n";

export const Route = createFileRoute("/attend")({
  validateSearch: z.object({ t: z.string().optional() }),
  ssr: false,
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
  component: AttendPage,
});

function AttendPage() {
  const { t: token } = Route.useSearch();
  return (
    <main className="mx-auto max-w-sm px-6 py-16">
      <h1 className="mb-8 text-2xl font-bold">{t("attend.title")}</h1>
      {token ? <AttendScan token={token} /> : <p className="text-destructive">{t("attend.invalidQr")}</p>}
    </main>
  );
}
