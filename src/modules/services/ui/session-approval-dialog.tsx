import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDiscountApprovalRequestFn } from "../functions/approval.functions";
import type { BranchApproverDto } from "../contracts";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { t, type MessageKey } from "@/i18n";
import { RemoteApprovalStatus } from "./remote-approval-status";
import { sessionSaveMessage } from "./session-save";

const APPROVAL_POLL_MS = 3000;

const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3";

/** يستطلع حالة الطلب البعدي كل 3 ثوان حتى يحسم الحفظ (020 B4.4). */
function useRemoteApprovalState(companyId: string, requestId: string | null) {
  const poll = useServerFn(getDiscountApprovalRequestFn);
  return useQuery({
    queryKey: ["discount-approval-request", companyId, requestId],
    enabled: requestId !== null,
    refetchInterval: APPROVAL_POLL_MS,
    refetchOnMount: "always",
    retry: false,
    queryFn: async () => {
      if (requestId === null) return null;
      try {
        return await poll({ data: { companyId, requestId } });
      } catch {
        return null;
      }
    },
  });
}

export interface SessionApprovalDialogProps {
  open: boolean;
  companyId: string;
  /** معتمدو الفرع الذين حفظوا رمز PIN؛ قد تكون القائمة فارغة ويبقى البعد متاحاً (020 A5). */
  approvers: BranchApproverDto[];
  /** رسالة محاولة سابقة فاشلة مثل «الرقم السري غلط». */
  message: string;
  busy: boolean;
  /** الطلب البعدي يشترط سبباً وسعراً مطلوباً صالحين قبل الإرسال (020 B4.1). */
  canRequest: boolean;
  requestApproval: () => Promise<{ id: string }>;
  onPin: (approverUserId: string, pin: string) => void;
  onRemoteSave: (approvalRequestId: string) => void;
  onClose: () => void;
}

/**
 * حوار اعتماد الخصم فوق الحد بتبويبين: رمز PIN على الجهاز أو طلب بعدي
 * يعتمده المدير من تطبيقه؛ الانتظار مع عد تنازلي ثم الحفظ بالاعتماد (020 B).
 */
export function SessionApprovalDialog({
  open,
  companyId,
  approvers,
  message,
  busy,
  canRequest,
  requestApproval,
  onPin,
  onRemoteSave,
  onClose,
}: SessionApprovalDialogProps) {
  const [approverUserId, setApproverUserId] = useState(approvers[0]?.userId ?? "");
  const [pin, setPin] = useState("");
  const [remoteRequestId, setRemoteRequestId] = useState<string | null>(null);
  const [requestError, setRequestError] = useState("");
  const { data: state } = useRemoteApprovalState(companyId, remoteRequestId);
  const reset = () => {
    setPin("");
    setRemoteRequestId(null);
    setRequestError("");
  };
  async function askRemotely() {
    setRequestError("");
    try {
      const { id } = await requestApproval();
      setRemoteRequestId(id);
    } catch (error) {
      setRequestError(sessionSaveMessage(error instanceof Error ? error.message : ""));
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("sessions.approvalTitle")}</DialogTitle>
          <DialogDescription>{t("sessions.askRemoteHint")}</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="pin">
          <TabsList>
            <TabsTrigger value="pin">{t("sessions.pinTab")}</TabsTrigger>
            <TabsTrigger value="remote">{t("sessions.remoteTab")}</TabsTrigger>
          </TabsList>
          <TabsContent value="pin" className="space-y-3">
            {approvers.length ? (
              <>
                <label className="block space-y-2">
                  <span>{t("sessions.approver")}</span>
                  <select
                    className={selectClass}
                    value={approverUserId}
                    onChange={(e) => setApproverUserId(e.target.value)}
                  >
                    {approvers.map((approver) => (
                      <option key={approver.userId} value={approver.userId}>
                        {approver.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-2">
                  <span>{t("sessions.pinEnter")}</span>
                  <InputOTP
                    maxLength={4}
                    value={pin}
                    onChange={setPin}
                    aria-label={t("sessions.pinEnter")}
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                    </InputOTPGroup>
                  </InputOTP>
                </label>
                <Button
                  type="button"
                  disabled={pin.length !== 4 || busy}
                  onClick={() => onPin(approverUserId, pin)}
                >
                  {t("sessions.pinSubmit")}
                </Button>
              </>
            ) : (
              <p className="text-muted-foreground">{t("pin.status.missing")}</p>
            )}
          </TabsContent>
          <TabsContent value="remote" className="space-y-3">
            {remoteRequestId === null ? (
              <>
                <Button type="button" disabled={!canRequest || busy} onClick={askRemotely}>
                  {t("sessions.askRemote")}
                </Button>
                {!canRequest && (
                  <p className="text-muted-foreground">{t("sessions.askRemoteNeedReason")}</p>
                )}
                {requestError && <p role="alert">{requestError}</p>}
              </>
            ) : (
              <>
                <RemoteApprovalStatus state={state ?? undefined} />
                <Button
                  type="button"
                  disabled={state?.status !== "approved" || busy}
                  onClick={() => onRemoteSave(remoteRequestId)}
                >
                  {t("sessions.remoteSave")}
                </Button>
              </>
            )}
          </TabsContent>
        </Tabs>
        {message && <p role="alert">{message}</p>}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            {t("ops.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
