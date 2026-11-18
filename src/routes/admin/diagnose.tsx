import { createFileRoute } from "@tanstack/react-router";
import { t } from "@/i18n";
import { DiagnosePage } from "@/modules/platform/ui/diagnose-page";

export const Route = createFileRoute("/admin/diagnose")({
  ssr: false,
  head: () => ({
    meta: [
      { title: `${t("diag.title")} — PosPay` },
      { name: "description", content: t("diag.subtitle") },
      { property: "og:title", content: t("diag.title") },
      { property: "og:description", content: t("diag.subtitle") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DiagnosePage,
});
