import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { t } from "@/i18n";

export interface SessionDuplicateDialogProps {
  open: boolean;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** تحذير الجلسة المشابهة بالصياغة المعتمدة؛ الحفظ فقط بعد تأكيد صريح (020 C2). */
export function SessionDuplicateDialog({
  open,
  busy,
  onConfirm,
  onCancel,
}: SessionDuplicateDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("sessions.duplicateWarning")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
            {t("ops.cancel")}
          </Button>
          <Button type="button" disabled={busy} onClick={onConfirm}>
            {t("sessions.duplicateConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
