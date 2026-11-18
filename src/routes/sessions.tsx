import { createFileRoute } from "@tanstack/react-router";
import { serviceSessionRecordingAvailable } from "@/modules/services";
import { SessionsPage } from "@/modules/services/ui/sessions-page";
import { operatorCompaniesQuery } from "@/modules/staff";
import { t } from "@/i18n";
export const Route = createFileRoute("/sessions")({
  head: () => ({
    meta: [
      { title: `${t("sessions.title")} — PosPay` },
      { name: "description", content: t("sessions.title") },
      { property: "og:title", content: t("sessions.title") },
      { property: "og:description", content: t("sessions.title") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) =>
    serviceSessionRecordingAvailable
      ? context.queryClient.ensureQueryData(operatorCompaniesQuery)
      : undefined,
  component: () =>
    serviceSessionRecordingAvailable ? (
      <SessionsPage />
    ) : (
      <p role="status">{t("sessions.unavailable")}</p>
    ),
});
