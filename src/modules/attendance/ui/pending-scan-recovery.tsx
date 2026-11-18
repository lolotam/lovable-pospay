import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import type { WorkspaceDto } from "@/modules/permissions";
import type { CardRequest } from "../card.contracts";
import { settleCardScanFn } from "../functions/card.functions";
import { clearPendingScan, readPendingScan, tallyScanMessage } from "./card-scan-storage";

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
  const settle = useServerFn(settleCardScanFn);
  const [attempt, setAttempt] = useState<CardRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    try {
      const stored = readPendingScan();
      const own = stored?.companyId === companyId && stored?.expectedUserId === userId;
      setAttempt(own ? stored : null);
    } catch {
      setAttempt(null);
    }
  }, [companyId, userId]);
  async function check(pending: CardRequest) {
    setBusy(true);
    setMessage("");
    try {
      const response = await settle({ data: pending });
      if (response.status === "unverified") return setMessage(t("cards.scanSessionUnverified"));
      clearPendingScan(pending.requestId);
      setAttempt(null);
      setMessage(tallyScanMessage(response, true));
    } catch {
      setMessage(t("cards.statusUnavailable"));
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
