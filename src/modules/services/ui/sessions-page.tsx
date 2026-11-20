import { Suspense, useRef, useState } from "react";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Save } from "lucide-react";
import { CompanyScope } from "@/modules/staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t, type MessageKey } from "@/i18n";
import type {
  BranchApproverDto,
  EditableSessionDto,
  EditSessionRequest,
  RecordSessionRequest,
  RecordSessionResult,
} from "../contracts";
import { getSessionFormFn, recordSessionFn } from "../functions/session.functions";
import { sessionSaveMessage, saveOutcomeAction } from "./session-save";
import { SessionApprovalDialog } from "./session-approval-dialog";
import { useRequestDiscountApproval } from "./approval-queries";
import { SessionDuplicateDialog } from "./session-duplicate-dialog";
import { SessionEditDialog } from "./session-edit-dialog";
import { RecentSessionsList } from "./recent-sessions-list";
import {
  ListPriceHint,
  PriceFields,
  SessionClientFields,
  SessionSelectors,
} from "./session-form-fields";

const sessionErrorCodes = ["IDEMPOTENCY_CONFLICT"];

const formQuery = (companyId: string) =>
  queryOptions({
    queryKey: ["session-form", companyId],
    queryFn: async () => {
      try {
        return await getSessionFormFn({ data: { companyId } });
      } catch {
        return null;
      }
    },
  });

export function SessionsPage({ canEdit = false }: { canEdit?: boolean }) {
  return (
    <CompanyScope title="sessions.title">
      {(id) => <SessionForm companyId={id} canEdit={canEdit} />}
    </CompanyScope>
  );
}

/** محاولة حفظ جلسة: نتيجة الخادم أو رسالة خطأ مرفوع. */
type RecordAttempt = { ok: true; result: RecordSessionResult } | { ok: false; message: string };

/** تحذير تكرار الجلسة أو اعتماد الخصم المرسل مع محاولة الحفظ (020 B6، C2). */
interface RecordExtra {
  confirmDuplicate?: true;
  managerApproval?: EditSessionRequest["managerApproval"];
}

function useSessionForm(companyId: string) {
  const { data } = useSuspenseQuery(formQuery(companyId));
  const record = useServerFn(recordSessionFn);
  const requestApprovalFn = useRequestDiscountApproval();
  const cache = useQueryClient();
  const [f, setF] = useState({
    serviceId: "",
    staffId: "",
    clientName: "",
    clientPhone: "",
    at: "",
    price: "",
    reason: "",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [duplicate, setDuplicate] = useState(false);
  const [approvers, setApprovers] = useState<BranchApproverDto[] | null>(null);
  const [approvalMessage, setApprovalMessage] = useState("");
  const [editing, setEditing] = useState<EditableSessionDto | null>(null);
  const request = useRef<string | null>(null);
  const confirmedDuplicate = useRef(false);
  const set = (k: keyof typeof f) => (v: string) => {
    request.current = null;
    confirmedDuplicate.current = false;
    setApprovers(null);
    setDuplicate(false);
    setF((p) => ({ ...p, [k]: v, ...(k === "serviceId" ? { staffId: "" } : {}) }));
  };
  function payload(extra?: RecordExtra): { data: RecordSessionRequest } {
    const requestId = (request.current ??= crypto.randomUUID());
    return {
      data: {
        companyId,
        serviceId: f.serviceId,
        staffId: f.staffId,
        clientName: f.clientName,
        clientPhone: f.clientPhone,
        occurredAt: f.at,
        ...(f.price ? { price: f.price } : {}),
        ...(f.reason ? { discountReason: f.reason } : {}),
        ...(extra?.confirmDuplicate ? { confirmDuplicate: true } : {}),
        ...(extra?.managerApproval ? { managerApproval: extra.managerApproval } : {}),
        requestId,
      },
    };
  }
  async function send(extra?: RecordExtra): Promise<RecordAttempt> {
    setBusy(true);
    setMessage("");
    try {
      return { ok: true, result: await record(payload(extra)) };
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (sessionErrorCodes.includes(code)) request.current = null;
      return { ok: false, message: sessionSaveMessage(code) };
    } finally {
      setBusy(false);
    }
  }
  function apply(attempt: RecordAttempt) {
    if (!attempt.ok) {
      if (approvers !== null) setApprovalMessage(attempt.message);
      else setMessage(attempt.message);
      return;
    }
    const action = saveOutcomeAction(attempt.result);
    if (action.kind === "saved") {
      request.current = null;
      confirmedDuplicate.current = false;
      setApprovers(null);
      setDuplicate(false);
      setF((p) => ({ ...p, clientName: "", clientPhone: "", at: "", price: "", reason: "" }));
      void cache.invalidateQueries({ queryKey: ["editable-sessions", companyId] });
      setMessage(t("sessions.saved"));
      return;
    }
    if (action.kind === "duplicate") {
      setDuplicate(true);
      return;
    }
    if (action.kind === "pin_required") {
      setApprovers(action.approvers);
      setApprovalMessage("");
      return;
    }
    if (approvers !== null) setApprovalMessage(action.message);
    else setMessage(action.message);
  }
  async function submit() {
    confirmedDuplicate.current = false;
    apply(await send());
  }
  function confirmDuplicate() {
    confirmedDuplicate.current = true;
    setDuplicate(false);
    void send({ confirmDuplicate: true }).then(apply);
  }
  async function askApproval(): Promise<{ id: string }> {
    const requestId = (request.current ??= crypto.randomUUID());
    return requestApprovalFn({
      data: {
        companyId,
        sessionId: requestId,
        serviceId: f.serviceId,
        staffId: f.staffId,
        price: f.price,
        discountReason: f.reason.trim(),
      },
    });
  }
  return {
    data,
    f,
    set,
    busy,
    message,
    duplicate,
    approvers,
    approvalMessage,
    confirmedDuplicate,
    editing,
    setEditing,
    setApprovers,
    setDuplicate,
    submit,
    confirmDuplicate,
    askApproval,
    apply,
    send,
  };
}

function SessionForm({ companyId, canEdit }: { companyId: string; canEdit: boolean }) {
  const flow = useSessionForm(companyId);
  const { data, f, set, busy, message } = flow;
  if (!data?.canRecord) return <p role="alert">{t("ops.forbidden")}</p>;
  const service = data.services.find((s) => s.id === f.serviceId);
  const staff = data.staff.filter((s) => service?.staffIds.includes(s.id));
  const selectedStaff = staff.find((s) => s.id === f.staffId);
  return (
    <div className="space-y-6">
      <form
        className="max-w-xl space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          flow.submit();
        }}
      >
        <SessionSelectors
          services={data.services}
          staff={staff}
          serviceId={f.serviceId}
          staffId={f.staffId}
          onService={set("serviceId")}
          onStaff={set("staffId")}
        />
        <SessionClientFields
          name={f.clientName}
          phone={f.clientPhone}
          onName={set("clientName")}
          onPhone={set("clientPhone")}
        />
        <label className="block space-y-2">
          <span>
            {t("sessions.at")} {selectedStaff && <bdi>{selectedStaff.timeZone}</bdi>}
          </span>
          <Input
            dir="ltr"
            type="datetime-local"
            disabled={!selectedStaff || busy}
            value={f.at}
            onChange={(e) => set("at")(e.target.value)}
            required
          />
        </label>
        {service && <ListPriceHint mills={service.priceMills} />}
        {service && (
          <PriceFields cap={data.discountCap} price={f.price} reason={f.reason} set={set} />
        )}
        <Button disabled={busy}>
          <Save />
          {t("sessions.save")}
        </Button>
        <p role="status">{message}</p>
      </form>
      {canEdit && (
        <Suspense fallback={null}>
          <RecentSessionsList companyId={companyId} onEdit={flow.setEditing} />
        </Suspense>
      )}
      <SessionDuplicateDialog
        open={flow.duplicate}
        busy={busy}
        onConfirm={flow.confirmDuplicate}
        onCancel={() => flow.setDuplicate(false)}
      />
      {flow.approvers !== null && (
        <SessionApprovalDialog
          open
          companyId={companyId}
          approvers={flow.approvers}
          message={flow.approvalMessage}
          busy={busy}
          canRequest={f.price.trim() !== "" && f.reason.trim() !== ""}
          requestApproval={flow.askApproval}
          onPin={(approverUserId, pin) =>
            void flow
              .send({
                ...(flow.confirmedDuplicate.current ? { confirmDuplicate: true } : {}),
                managerApproval: { kind: "pin", approverUserId, pin },
              })
              .then(flow.apply)
          }
          onRemoteSave={(approvalRequestId) =>
            void flow
              .send({
                ...(flow.confirmedDuplicate.current ? { confirmDuplicate: true } : {}),
                managerApproval: { kind: "remote", approvalRequestId },
              })
              .then(flow.apply)
          }
          onClose={() => {
            flow.setApprovers(null);
          }}
        />
      )}
      {flow.editing && (
        <SessionEditDialog
          companyId={companyId}
          session={flow.editing}
          services={data.services}
          staff={data.staff}
          onClose={() => flow.setEditing(null)}
          onSaved={() => flow.setEditing(null)}
        />
      )}
    </div>
  );
}
