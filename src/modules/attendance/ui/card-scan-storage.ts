import { t } from "@/i18n";
import type { scanCardFn } from "../functions/card.functions";
import { cardRequestInput } from "../card.contracts";

type RecordedScan = Extract<Awaited<ReturnType<typeof scanCardFn>>, { status: "recorded" }>["scan"];

function scanResultMessage({ name, result }: RecordedScan) {
  const key =
    result.outcome === "checked_in"
      ? "attend.checkedIn"
      : result.outcome === "checked_out"
        ? "attend.checkedOut"
        : "cards.error";
  return name + " \u00b7 " + t(key);
}

export const pendingScanKey = "pospay:card-scan";

export function readPendingScan() {
  const raw = sessionStorage.getItem(pendingScanKey);
  return raw ? cardRequestInput.parse(JSON.parse(raw)) : null;
}

/** يمسح المحاولة المعلّقة فقط إذا كانت هي نفسها التي عُرضت نتيجتها. */
export function clearPendingScan(requestId: string) {
  if (readPendingScan()?.requestId === requestId) sessionStorage.removeItem(pendingScanKey);
}

export function tallyScanMessage(response: Awaited<ReturnType<typeof scanCardFn>>, retry: boolean) {
  if (response.status === "clock_invalid") return t("cards.scanClockInvalid");
  if (response.status === "recorded" && response.scan.result.outcome !== "needs_intent")
    return scanResultMessage(response.scan);
  if (response.status === "recorded") return t("cards.scanIntentRescan");
  if (response.status === "cancelled") return t("cards.scanCancelled");
  return t(retry ? "cards.statusDiscontinued" : "cards.scanError");
}
