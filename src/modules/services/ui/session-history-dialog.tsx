import { useQuery } from "@tanstack/react-query";
import type { SessionEditHistoryDto, SessionEditSnapshot } from "../contracts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { t, type MessageKey } from "@/i18n";
import { formatBranchLocal, kwd, maskPhone } from "./session-format";
import { sessionEditsQuery } from "./session-queries";

export interface SessionHistoryDialogProps {
  companyId: string;
  timeZone: string;
  sessionId: string;
  onClose: () => void;
}

/** حوار تاريخ تعديلات جلسة واحدة: الوقت والمعدّلة والسبب وكل حقل قبل → بعد (020 D4). */
export function SessionHistoryDialog({
  companyId,
  timeZone,
  sessionId,
  onClose,
}: SessionHistoryDialogProps) {
  const { data } = useQuery(sessionEditsQuery(companyId, sessionId));
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[80dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("sessions.history")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        {!data?.length ? (
          <p role="status">{t("ops.empty")}</p>
        ) : (
          <ul className="space-y-4">
            {data.map((edit) => (
              <EditEntry key={edit.id} edit={edit} timeZone={timeZone} />
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditEntry({ edit, timeZone }: { edit: SessionEditHistoryDto; timeZone: string }) {
  const changes = snapshotChanges(edit.before, edit.after);
  return (
    <li className="space-y-2 rounded-md border border-border p-3 text-sm">
      <p>
        <bdi dir="ltr">{formatBranchLocal(edit.editedAt, timeZone)}</bdi> ·{" "}
        {edit.editorName ?? t("ops.genericManager")}
      </p>
      <p className="text-muted-foreground">{edit.editReason}</p>
      <ul className="space-y-1">
        {changes.map(([label, before, after]) => (
          <li key={label}>
            {t(label as MessageKey)}: <bdi dir="ltr">{before}</bdi> ← <bdi dir="ltr">{after}</bdi>
          </li>
        ))}
      </ul>
    </li>
  );
}

/** يشتق حقول التغيير قبل → بعد من لقطتي التعديل دون أي أرقام معرفات خام. */
function snapshotChanges(
  before: SessionEditSnapshot,
  after: SessionEditSnapshot,
): [string, string, string][] {
  const changes: [string, string, string][] = [];
  if (before.serviceName !== after.serviceName)
    changes.push(["sessions.service", before.serviceName, after.serviceName]);
  if (before.clientName !== after.clientName || before.clientPhoneLast3 !== after.clientPhoneLast3)
    changes.push(["sessions.clientName", clientText(before), clientText(after)]);
  if (before.occurredAt !== after.occurredAt)
    changes.push(["sessions.at", before.occurredAt, after.occurredAt]);
  if (before.priceMills !== after.priceMills)
    changes.push(["sessions.price", kwd(before.priceMills), kwd(after.priceMills)]);
  if (before.discountReason !== after.discountReason)
    changes.push(["approvals.reason", before.discountReason ?? "—", after.discountReason ?? "—"]);
  return changes;
}

function clientText(snapshot: SessionEditSnapshot): string {
  const phone = maskPhone(snapshot.clientPhoneLast3);
  return phone ? `${snapshot.clientName} (${phone})` : snapshot.clientName;
}
