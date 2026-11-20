import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Save } from "lucide-react";
import { editSessionFn } from "../functions/session.functions";
import type {
  BranchApproverDto,
  EditSessionRequest,
  EditSessionResult,
  EditableSessionDto,
} from "../contracts";
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
import { branchLocalInputValue, kwd } from "./session-format";
import { saveOutcomeAction, sessionSaveMessage } from "./session-save";
import { useRequestDiscountApproval } from "./approval-queries";
import { SessionApprovalDialog } from "./session-approval-dialog";

/** خيارات الخدمة في نموذج التعديل؛ staffIds اختياري لتصفية الموظفات المسندة. */
export interface SessionPickerService {
  id: string;
  name: string;
  staffIds?: string[];
}
/** خيارات الموظفات في نموذج التعديل. */
export interface SessionPickerStaff {
  id: string;
  name: string;
}

export interface SessionEditDialogProps {
  companyId: string;
  session: EditableSessionDto;
  services: SessionPickerService[];
  staff: SessionPickerStaff[];
  onClose: () => void;
  onSaved: () => void;
}

/** محاولة حفظ التعديل: نتيجة الخادم أو رسالة خطأ مرفوع. */
type EditAttempt = { ok: true; result: EditSessionResult } | { ok: false; message: string };

const formClass = "max-w-md space-y-4";

/**
 * حوار تعديل جلسة مفتوحة الشهر: سبب التعديل إلزامي، وتغيير الاسم يشترط
 * رقم العميلة (قرار وائل 5)، واعتماد الخصم فوق الحد بـ PIN أو بعدياً (020 D3).
 */
export function SessionEditDialog({
  companyId,
  session,
  services,
  staff,
  onClose,
  onSaved,
}: SessionEditDialogProps) {
  const save = useServerFn(editSessionFn);
  const requestApprovalFn = useRequestDiscountApproval();
  const [form, setForm] = useState(() => ({
    serviceId: session.serviceId,
    staffId: session.staffId,
    clientName: session.clientName,
    clientPhone: "",
    at: branchLocalInputValue(session.occurredAt, session.timeZone),
    price: kwd(session.priceMills),
    reason: session.discountReason ?? "",
    editReason: "",
  }));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [approvers, setApprovers] = useState<BranchApproverDto[] | null>(null);
  const [approvalMessage, setApprovalMessage] = useState("");
  const listPriceUnchanged = useRef(true);
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));
  const selectedService = services.find((service) => service.id === form.serviceId);
  const staffOptions = selectedService?.staffIds
    ? staff.filter((member) => selectedService.staffIds?.includes(member.id))
    : staff;
  const nameChanged = form.clientName.trim() !== session.clientName.trim();
  const needsPhone = nameChanged && form.clientPhone.trim() === "";

  function editPayload(managerApproval?: EditSessionRequest["managerApproval"]) {
    return {
      data: {
        companyId,
        sessionId: session.id,
        serviceId: form.serviceId,
        staffId: form.staffId,
        clientName: form.clientName,
        ...(form.clientPhone.trim() ? { clientPhone: form.clientPhone.trim() } : {}),
        occurredAt: form.at,
        price: form.price,
        ...(form.reason.trim() ? { discountReason: form.reason.trim() } : {}),
        editReason: form.editReason,
        ...(managerApproval ? { managerApproval } : {}),
      },
    };
  }

  async function send(
    managerApproval?: EditSessionRequest["managerApproval"],
  ): Promise<EditAttempt> {
    setBusy(true);
    setMessage("");
    try {
      return { ok: true, result: await save(editPayload(managerApproval)) };
    } catch (error) {
      return {
        ok: false,
        message: sessionSaveMessage(error instanceof Error ? error.message : ""),
      };
    } finally {
      setBusy(false);
    }
  }

  function apply(attempt: EditAttempt) {
    if (!attempt.ok) {
      setMessage(attempt.message);
      if (approvers !== null) setApprovalMessage(attempt.message);
      return;
    }
    const action = saveOutcomeAction(attempt.result);
    if (action.kind === "saved") {
      onSaved();
      return;
    }
    if (action.kind === "pin_required") {
      listPriceUnchanged.current = form.serviceId === session.serviceId;
      setApprovers(action.approvers);
      setApprovalMessage("");
      return;
    }
    const text = action.kind === "duplicate" ? t("sessions.error") : action.message;
    if (approvers !== null) setApprovalMessage(text);
    else setMessage(text);
  }

  async function askApproval(): Promise<{ id: string }> {
    return requestApprovalFn({
      data: {
        companyId,
        sessionId: session.id,
        serviceId: form.serviceId,
        staffId: form.staffId,
        price: form.price,
        ...(listPriceUnchanged.current ? { listPrice: kwd(session.listPriceMills) } : {}),
        discountReason: form.reason.trim(),
      },
    });
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("sessions.editTitle")}</DialogTitle>
          <DialogDescription>{session.serviceName}</DialogDescription>
        </DialogHeader>
        <form
          className={formClass}
          onSubmit={(event) => {
            event.preventDefault();
            void send().then(apply);
          }}
        >
          <label className="block space-y-2">
            <span>{t("sessions.service")}</span>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3"
              value={form.serviceId}
              onChange={(e) => set("serviceId")(e.target.value)}
            >
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-2">
            <span>{t("sessions.staff")}</span>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3"
              value={form.staffId}
              onChange={(e) => set("staffId")(e.target.value)}
            >
              {staffOptions.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-2">
            <span>{t("sessions.clientName")}</span>
            <Input
              value={form.clientName}
              onChange={(e) => set("clientName")(e.target.value)}
              required
              maxLength={120}
            />
          </label>
          <label className="block space-y-2">
            <span>{t("sessions.clientPhone")}</span>
            <Input
              dir="ltr"
              inputMode="tel"
              value={form.clientPhone}
              onChange={(e) => set("clientPhone")(e.target.value)}
              minLength={8}
              maxLength={24}
              placeholder={session.clientPhoneLast3 ? `•••${session.clientPhoneLast3}` : ""}
            />
            {needsPhone && (
              <p className="text-muted-foreground">{t("sessions.CLIENT_PHONE_REQUIRED")}</p>
            )}
          </label>
          <label className="block space-y-2">
            <span>
              {t("sessions.at")} <bdi>{session.timeZone}</bdi>
            </span>
            <Input
              dir="ltr"
              type="datetime-local"
              value={form.at}
              onChange={(e) => set("at")(e.target.value)}
              required
            />
          </label>
          <label className="block space-y-2">
            <span>
              {t("sessions.price")} ({t("sessions.listPrice")} {kwd(session.listPriceMills)})
            </span>
            <Input
              dir="ltr"
              inputMode="decimal"
              value={form.price}
              onChange={(e) => set("price")(e.target.value)}
              required
            />
          </label>
          {form.price.trim() !== "" && (
            <label className="block space-y-2">
              <span>{t("sessions.reason")}</span>
              <Input
                value={form.reason}
                maxLength={200}
                onChange={(e) => set("reason")(e.target.value)}
              />
            </label>
          )}
          <label className="block space-y-2">
            <span>{t("sessions.editReason")}</span>
            <Input
              value={form.editReason}
              maxLength={200}
              onChange={(e) => set("editReason")(e.target.value)}
              required
            />
          </label>
          {message && <p role="alert">{message}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              {t("ops.cancel")}
            </Button>
            <Button type="submit" disabled={busy || form.editReason.trim() === ""}>
              <Save />
              {t("sessions.save")}
            </Button>
          </DialogFooter>
        </form>
        {approvers !== null && (
          <SessionApprovalDialog
            open
            companyId={companyId}
            approvers={approvers}
            message={approvalMessage}
            busy={busy}
            canRequest={form.price.trim() !== "" && form.reason.trim() !== ""}
            requestApproval={askApproval}
            onPin={(approverUserId, pin) =>
              void send({ kind: "pin", approverUserId, pin }).then(apply)
            }
            onRemoteSave={(approvalRequestId) =>
              void send({ kind: "remote", approvalRequestId }).then(apply)
            }
            onClose={() => {
              setApprovers(null);
              setApprovalMessage("");
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
