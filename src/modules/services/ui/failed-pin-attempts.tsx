import { useQuery } from "@tanstack/react-query";
import { t } from "@/i18n";
import { failedPinAttemptsQuery } from "./approval-queries";

/** محاولات PIN الفاشلة: المعتمدة والطالبة والجهاز والوقت (020 B3). */
export function FailedPinAttempts({ companyId }: { companyId: string }) {
  const { data } = useQuery(failedPinAttemptsQuery(companyId));
  if (!data?.length) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{t("pin.attempts")}</h2>
      <ul className="space-y-2">
        {data.map((attempt) => (
          <li key={attempt.id} className="rounded-md border border-border bg-card p-3 text-sm">
            <span>
              {t("pin.attemptApprover")}: {attempt.approverName ?? t("ops.genericManager")} ·{" "}
              {t("pin.attemptRequester")}: {attempt.requesterName ?? t("ops.genericManager")}
            </span>
            <span className="block text-muted-foreground">
              {t("pin.attemptTime")}:{" "}
              <bdi dir="ltr">{new Date(attempt.attemptedAt).toLocaleString()}</bdi>
              {attempt.userAgent && (
                <>
                  {" · "}
                  {t("pin.attemptDevice")}:{" "}
                  <span
                    className="inline-block max-w-xs truncate align-bottom"
                    title={attempt.userAgent}
                  >
                    {attempt.userAgent}
                  </span>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
