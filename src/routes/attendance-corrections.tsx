import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { CorrectionsPage } from "@/modules/attendance/ui/corrections-page";
import { t } from "@/i18n";

export const Route = createFileRoute("/attendance-corrections")({
  head: () => ({
    meta: [
      { title: "تصحيح الانصراف المنسي — PosPay" },
      { name: "description", content: "مراجعة المدير للانصراف المنسي مع حفظ الأصل وسبب التصحيح." },
      { property: "og:title", content: "تصحيح الانصراف المنسي — PosPay" },
      {
        property: "og:description",
        content: "مراجعة المدير للانصراف المنسي مع حفظ الأصل وسبب التصحيح.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <ClientOnly fallback={<p role="status">{t("phone.loading")}</p>}>
      <CorrectionsPage />
    </ClientOnly>
  ),
});
