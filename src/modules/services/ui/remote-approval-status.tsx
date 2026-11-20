import { useEffect, useState } from "react";
import { t } from "@/i18n";

/** حالة طلب الاعتماد البعدي كما يعيدها الاستطلاع كل 3 ثوان (020 B4.4). */
export interface RemoteApprovalState {
  status: "waiting" | "approved" | "rejected" | "expired";
  approverName: string | null;
  expiresAt: string;
}

/** يحسب الثواني المتبقية حتى لحظة ISO مع تحديث كل ثانية للعد التنازلي. */
function useSecondsLeft(expiresAt: string | undefined): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);
  if (!expiresAt) return null;
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000));
}

const countdownText = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
};

/** يعرض حالة الطلب البعدي مع العد التنازلي واسم المعتمد عند القبول (020 B4.4). */
export function RemoteApprovalStatus({ state }: { state: RemoteApprovalState | undefined }) {
  const secondsLeft = useSecondsLeft(state?.expiresAt);
  if (!state) return <p role="status">{t("phone.loading")}</p>;
  if (state.status === "waiting" && secondsLeft !== null) {
    return (
      <p role="status">
        {t("sessions.waiting")} <bdi dir="ltr">{countdownText(secondsLeft)}</bdi>
      </p>
    );
  }
  if (state.status === "approved") {
    const name = state.approverName ?? t("ops.genericManager");
    return <p role="status">{t("sessions.approvedBy").replace("{name}", name)}</p>;
  }
  if (state.status === "rejected") return <p role="alert">{t("sessions.rejected")}</p>;
  return <p role="alert">{t("sessions.expired")}</p>;
}
