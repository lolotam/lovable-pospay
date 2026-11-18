import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import type { WorkspaceDto } from "@/modules/permissions";
import type { CardRequest } from "../card.contracts";
import { settleCardScanFn } from "../functions/card.functions";
import { clearPendingScan, readPendingScan, tallyScanMessage } from "./card-scan-storage";

type ShownResult = { scope: string; requestId: string | null; text: string };

export interface PendingScanRecoveryProps {
  workspace: WorkspaceDto | null;
  userId: string;
}

/**
 * يظهر مكان صفحة المسح عندما تُسحب pos.access: يسترجع نتيجة مسح معلّق لنفس الشركة والمشغّل
 * فقط، ولا يسمح بمسح جديد (issue #13).
 */
export function PendingScanRecovery({ workspace, userId }: PendingScanRecoveryProps) {
  const companyId = workspace?.kind === "company" ? workspace.companyId : null;
  const scope = `${companyId ?? ""}|${userId}`;
  const settle = useServerFn(settleCardScanFn);
  const [attempt, setAttempt] = useState<CardRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<ShownResult | null>(null);
  const message = shown?.scope === scope ? shown.text : "";
  useEffect(() => {
    try {
      const stored = readPendingScan();
      const own = stored?.companyId === companyId && stored?.expectedUserId === userId;
      setAttempt(own ? stored : null);
    } catch {
      setAttempt(null);
    }
  }, [companyId, userId]);
  // المحاولة تُحذف بعد عرض نتيجتها لنفس الشركة والمشغّل فقط؛ لو اتشال المكوّن أو اتغيّر النطاق تفضل محفوظة.
  useEffect(() => {
    if (shown?.scope !== scope || !shown.requestId) return;
    clearPendingScan(shown.requestId);
    setAttempt(null);
  }, [shown, scope]);
  async function check(pending: CardRequest) {
    const requestScope = scope;
    setBusy(true);
    setShown(null);
    try {
      const response = await settle({ data: pending });
      setShown(
        response.status === "unverified"
          ? { scope: requestScope, requestId: null, text: t("cards.scanSessionUnverified") }
          : {
              scope: requestScope,
              requestId: pending.requestId,
              text: tallyScanMessage(response, true),
            },
      );
    } catch {
      setShown({ scope: requestScope, requestId: null, text: t("cards.statusUnavailable") });
    } finally {
      setBusy(false);
    }
  }
  if (!attempt && !message) return null;
  return (
    <section className="mx-auto max-w-lg space-y-3 px-4 pb-16">
      {attempt && (
        <>
          <p>{t("cards.pendingScanRecovery")}</p>
          <Button type="button" disabled={busy} onClick={() => void check(attempt)}>
            {t("cards.checkScanStatus")}
          </Button>
        </>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
