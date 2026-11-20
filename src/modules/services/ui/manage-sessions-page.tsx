import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarBlank, ClockCounterClockwise, PencilSimpleLine } from "@phosphor-icons/react";
import { CompanyScope } from "@/modules/staff";
import { getServiceOverridesFn } from "@/modules/commissions";
import type { EditableSessionDto } from "../contracts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { t } from "@/i18n";
import { formatBranchLocal, kwd, maskPhone } from "./session-format";
import { closedMonthsQuery, editableSessionsQuery } from "./session-queries";
import { SessionEditDialog } from "./session-edit-dialog";
import { SessionHistoryDialog } from "./session-history-dialog";
import { CloseMonthDialog } from "./close-month-dialog";

export function ManageSessionsPage({ isOwner = false }: { isOwner?: boolean }) {
  return (
    <CompanyScope title="sessions.manageTitle">
      {(id) => <ManageSessions companyId={id} isOwner={isOwner} />}
    </CompanyScope>
  );
}

const todayText = () => new Date().toISOString().slice(0, 10);
const monthRange = (): [string, string] => {
  const now = todayText();
  const year = now.slice(0, 4);
  const month = now.slice(5, 7);
  const lastDay = new Date(Number(year), Number(month), 0).getDate();
  return [`${year}-${month}-01`, `${year}-${month}-${String(lastDay).padStart(2, "0")}`];
};

function ManageSessions({ companyId, isOwner }: { companyId: string; isOwner: boolean }) {
  const [range] = useState(monthRange);
  const [from, setFrom] = useState(range[0]);
  const [until, setUntil] = useState(range[1]);
  const [editing, setEditing] = useState<EditableSessionDto | null>(null);
  const [history, setHistory] = useState<EditableSessionDto | null>(null);
  const [closing, setClosing] = useState(false);
  const cache = useQueryClient();
  const {
    data: sessions,
    fetchStatus,
    isFetchedAfterMount,
  } = useQuery(editableSessionsQuery(companyId, from, until));
  const { data: closedMonths } = useQuery(closedMonthsQuery(companyId));
  const { data: pickers } = useQuery({
    queryKey: ["session-edit-pickers", companyId],
    enabled: editing !== null,
    staleTime: 60_000,
    queryFn: async () => {
      try {
        return await getServiceOverridesFn({ data: { companyId } });
      } catch {
        return null;
      }
    },
  });
  const refresh = () => cache.invalidateQueries({ queryKey: ["editable-sessions", companyId] });
  return (
    <div className="space-y-6">
      <form
        className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        onSubmit={(e) => e.preventDefault()}
      >
        <label className="block space-y-2">
          <span>{t("sessions.from")}</span>
          <Input dir="ltr" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="block space-y-2">
          <span>{t("sessions.until")}</span>
          <Input dir="ltr" type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
        </label>
        {isOwner && (
          <Button type="button" onClick={() => setClosing(true)}>
            <CalendarBlank aria-hidden />
            {t("sessions.closeMonth")}
          </Button>
        )}
      </form>
      {fetchStatus !== "idle" || !isFetchedAfterMount ? (
        <p role="status">{t("phone.loading")}</p>
      ) : sessions === undefined || sessions === null ? (
        <p role="alert">{t("ops.forbidden")}</p>
      ) : !sessions.length ? (
        <p role="status">{t("ops.empty")}</p>
      ) : (
        <SessionsTable sessions={sessions} onEdit={setEditing} onHistory={setHistory} />
      )}
      {isOwner && (
        <ClosedMonthsList
          months={(closedMonths ?? []).map((month) => ({
            periodMonth: month.periodMonth,
            closedAt: month.closedAt,
            note: month.note,
          }))}
        />
      )}
      {editing && (
        <SessionEditDialog
          companyId={companyId}
          session={editing}
          services={pickers?.services ?? []}
          staff={pickers?.staff ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void refresh();
          }}
        />
      )}
      {history && (
        <SessionHistoryDialog
          companyId={companyId}
          timeZone={history.timeZone}
          sessionId={history.id}
          onClose={() => setHistory(null)}
        />
      )}
      {closing && <CloseMonthDialog companyId={companyId} onClose={() => setClosing(false)} />}
    </div>
  );
}

function SessionsTable({
  sessions,
  onEdit,
  onHistory,
}: {
  sessions: EditableSessionDto[];
  onEdit: (session: EditableSessionDto) => void;
  onHistory: (session: EditableSessionDto) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("sessions.at")}</TableHead>
          <TableHead>{t("sessions.clientName")}</TableHead>
          <TableHead>{t("sessions.service")}</TableHead>
          <TableHead>{t("sessions.staff")}</TableHead>
          <TableHead>{t("sessions.price")}</TableHead>
          <TableHead>{t("sessions.edits")}</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sessions.map((session) => (
          <TableRow key={session.id}>
            <TableCell>
              <bdi dir="ltr">{formatBranchLocal(session.occurredAt, session.timeZone)}</bdi>
            </TableCell>
            <TableCell>
              {session.clientName}
              {session.clientPhoneLast3 && (
                <>
                  {" "}
                  <bdi dir="ltr" className="text-muted-foreground">
                    {maskPhone(session.clientPhoneLast3)}
                  </bdi>
                </>
              )}
            </TableCell>
            <TableCell>{session.serviceName}</TableCell>
            <TableCell>{session.staffName}</TableCell>
            <TableCell>
              <bdi dir="ltr">{kwd(session.priceMills)}</bdi>
              {session.discountReason && (
                <span className="block text-muted-foreground">{session.discountReason}</span>
              )}
            </TableCell>
            <TableCell>
              {session.monthClosed ? (
                <Badge variant="outline">{t("sessions.monthClosed")}</Badge>
              ) : (
                session.editCount
              )}
            </TableCell>
            <TableCell className="whitespace-nowrap">
              {session.editCount > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("sessions.history")}
                  onClick={() => onHistory(session)}
                >
                  <ClockCounterClockwise aria-hidden />
                </Button>
              )}
              {session.canEdit && (
                <Button variant="outline" onClick={() => onEdit(session)}>
                  <PencilSimpleLine aria-hidden />
                  {t("sessions.editButton")}
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ClosedMonthsList({
  months,
}: {
  months: { periodMonth: string; closedAt: string; note: string | null }[];
}) {
  if (!months.length) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{t("sessions.closedMonths")}</h2>
      <ul className="space-y-1 text-sm">
        {months.map((month) => (
          <li key={month.periodMonth}>
            <bdi dir="ltr">{month.periodMonth}</bdi> ·{" "}
            <bdi dir="ltr">{new Date(month.closedAt).toLocaleString()}</bdi>
            {month.note ? ` · ${month.note}` : ""}
          </li>
        ))}
      </ul>
    </section>
  );
}
