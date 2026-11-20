import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { closeMonthFn, getMonthCloseStatusFn } from "../functions/session.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { t } from "@/i18n";

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

export interface CloseMonthDialogProps {
  companyId: string;
  onClose: () => void;
}

/**
 * إغلاق شهر عمولات نهائياً: الشهر المنتهي بتأكيد عادي، والشهر غير المنتهي
 * بتحذير قاطع وأيام متبقية وقراءة الشهر كتابةً قبل تفعيل الزر (020 D2).
 */
export function CloseMonthDialog({ companyId, onClose }: CloseMonthDialogProps) {
  const close = useServerFn(closeMonthFn);
  const status = useServerFn(getMonthCloseStatusFn);
  const cache = useQueryClient();
  const [month, setMonth] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const valid = monthPattern.test(month);
  const { data: statusData } = useQuery({
    queryKey: ["month-close-status", companyId, month],
    enabled: valid,
    staleTime: 0,
    queryFn: async () => {
      try {
        return await status({ data: { companyId, periodMonth: `${month}-01` } });
      } catch {
        return null;
      }
    },
  });
  const daysRemaining = valid ? (statusData?.daysRemaining ?? null) : null;
  const unfinished = daysRemaining !== null && daysRemaining > 0;
  const canSubmit = valid && !busy && (!unfinished || typed === month);
  async function submit() {
    setBusy(true);
    setMessage("");
    try {
      await close({
        data: {
          companyId,
          periodMonth: `${month}-01`,
          ...(unfinished ? { confirmUnfinishedMonth: true } : {}),
        },
      });
      setMessage(t("sessions.closeMonthDone"));
      await cache.invalidateQueries({ queryKey: ["closed-months", companyId] });
      await cache.invalidateQueries({ queryKey: ["editable-sessions", companyId] });
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      setMessage(
        code === "MONTH_NOT_ENDED_CONFIRMATION_REQUIRED"
          ? t("sessions.MONTH_NOT_ENDED_CONFIRMATION_REQUIRED")
          : t("sessions.error"),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("sessions.closeMonth")}</DialogTitle>
          <DialogDescription>{t("sessions.closeMonthHint")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-2">
            <span>{t("sessions.closeMonth")}</span>
            <Input
              dir="ltr"
              type="month"
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                setTyped("");
                setMessage("");
              }}
              required
            />
          </label>
          {unfinished && (
            <>
              <p role="alert">{t("sessions.closeMonthUnfinished")}</p>
              <p role="status">
                {t("sessions.closeMonthDays").replace("{days}", String(daysRemaining))}
              </p>
              <label className="block space-y-2">
                <span>{t("sessions.typeMonth")}</span>
                <Input
                  dir="ltr"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder="YYYY-MM"
                  maxLength={7}
                />
              </label>
            </>
          )}
          {message && <p role="status">{message}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            {t("ops.cancel")}
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            variant={unfinished ? "destructive" : "default"}
            onClick={() => void submit()}
          >
            {t("sessions.closeConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
