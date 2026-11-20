import { useSuspenseQuery } from "@tanstack/react-query";
import { PencilSimpleLine } from "@phosphor-icons/react";
import type { EditableSessionDto } from "../contracts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { t } from "@/i18n";
import { formatBranchLocal, kwd, maskPhone } from "./session-format";
import { recentSessionsQuery } from "./session-queries";

export interface RecentSessionsListProps {
  companyId: string;
  onEdit: (session: EditableSessionDto) => void;
}

/** آخر جلسات الأيام السبعة لفرع المحرر أسفل نموذج التسجيل (020 D5). */
export function RecentSessionsList({ companyId, onEdit }: RecentSessionsListProps) {
  const { data } = useSuspenseQuery(recentSessionsQuery(companyId));
  if (!data?.length) return null;
  return (
    <section className="max-w-xl space-y-3">
      <h2 className="text-lg font-semibold">{t("sessions.recent")}</h2>
      <ul className="space-y-2">
        {data.map((session) => (
          <SessionRow key={session.id} session={session} onEdit={onEdit} />
        ))}
      </ul>
    </section>
  );
}

function SessionRow({
  session,
  onEdit,
}: {
  session: EditableSessionDto;
  onEdit: (session: EditableSessionDto) => void;
}) {
  const phone = maskPhone(session.clientPhoneLast3);
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-3 text-sm">
      <span className="min-w-0 flex-1">
        <b>{session.clientName}</b>
        {phone && (
          <>
            {" · "}
            <bdi dir="ltr">{phone}</bdi>
          </>
        )}
        <span className="block text-muted-foreground">
          {session.serviceName} · {session.staffName} ·{" "}
          <bdi dir="ltr">{formatBranchLocal(session.occurredAt, session.timeZone)}</bdi> ·{" "}
          {kwd(session.priceMills)}
        </span>
        {session.discountReason && (
          <span className="block text-muted-foreground">{session.discountReason}</span>
        )}
      </span>
      {session.monthClosed && <Badge variant="outline">{t("sessions.monthClosed")}</Badge>}
      {session.canEdit && (
        <Button variant="outline" onClick={() => onEdit(session)}>
          <PencilSimpleLine aria-hidden />
          {t("sessions.editButton")}
        </Button>
      )}
    </li>
  );
}
