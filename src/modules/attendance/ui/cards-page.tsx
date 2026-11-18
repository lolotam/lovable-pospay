import { useEffect, useRef, useState } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Printer, CreditCard, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { CompanyScope } from "@/modules/staff";
import { getCardsFn, approveCardsFn, issueCardFn, revokeCardFn } from "../functions/card.functions";
import type { IssuedCard } from "../card.contracts";
const cardQuery = (companyId: string, userId: string) =>
  queryOptions({
    queryKey: ["cards", userId, companyId],
    queryFn: async () => {
      try {
        return {
          value: await getCardsFn({ data: { companyId, expectedUserId: userId } }),
          error: null,
        };
      } catch (error) {
        return {
          value: null,
          error:
            error instanceof Error && error.message === "FORBIDDEN"
              ? ("ops.denied" as const)
              : ("ops.forbidden" as const),
        };
      }
    },
  });
export function CardsPage() {
  const [switchLocked, setSwitchLocked] = useState(false);
  return (
    <CompanyScope title="cards.title" switchLocked={switchLocked}>
      {(id, userId) => (
        <CardActions companyId={id} userId={userId} onSwitchLockChange={setSwitchLocked} />
      )}
    </CompanyScope>
  );
}
function useCards(companyId: string, userId: string) {
  const { data, isFetching, refetch } = useSuspenseQuery(cardQuery(companyId, userId));
  const [issued, setIssued] = useState<IssuedCard | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const approve = useServerFn(approveCardsFn),
    issue = useServerFn(issueCardFn),
    revoke = useServerFn(revokeCardFn);
  async function run(action: "approve" | "issue" | "revoke", id = "") {
    if (busy || isFetching || issued) return;
    setBusy(true);
    setMessage("");
    setIssued(null);
    let saved = false;
    try {
      if (action === "approve") await approve({ data: { companyId } });
      else if (action === "issue") setIssued(await issue({ data: { companyId, staffId: id } }));
      else await revoke({ data: { companyId, cardId: id } });
      setConfirm(null);
      saved = true;
    } catch {
      setMessage(t(action === "issue" ? "cards.issueUnconfirmed" : "cards.error"));
    } finally {
      const refreshed = await refetch().catch(() => undefined);
      if (saved) {
        const verified = refreshed?.data?.value && !refreshed.data.error;
        setMessage(t(verified ? "ops.saved" : "cards.savedRefreshFailed"));
      }
      setBusy(false);
    }
  }
  return {
    data,
    busy,
    confirm,
    setConfirm,
    issued,
    dismissIssued: () => setIssued(null),
    message,
    run,
  };
}
type CardsState = ReturnType<typeof useCards>;
type CardViewProps = Pick<CardsState, "busy" | "run" | "confirm" | "setConfirm"> & {
  value: NonNullable<CardsState["data"]["value"]>;
};
export interface CardActionsProps {
  companyId: string;
  userId: string;
  policyOnly?: boolean;
  onSwitchLockChange?: (locked: boolean) => void;
}
export function CardActions({
  companyId,
  userId,
  policyOnly = false,
  onSwitchLockChange,
}: CardActionsProps) {
  const { data, busy, confirm, setConfirm, issued, dismissIssued, message, run } = useCards(
    companyId,
    userId,
  );
  useEffect(() => {
    onSwitchLockChange?.(busy || !!issued);
  }, [busy, issued, onSwitchLockChange]);
  const value = data.value;
  return (
    <div className="space-y-6">
      {data.error && <p role="alert">{t(data.error)}</p>}
      {value && <CardPolicy value={value} busy={busy || !!issued} run={run} />}
      {value && !policyOnly && (
        <>
          <CardList
            value={value}
            busy={busy || !!issued}
            confirm={confirm}
            setConfirm={setConfirm}
            run={run}
          />
          {!value.staff.length && <p>{t("ops.empty")}</p>}
        </>
      )}
      {!policyOnly && issued && (
        <>
          <PrintableCard card={issued} />
          <Button type="button" variant="outline" onClick={dismissIssued}>
            {t("cards.dismissIssued")}
          </Button>
        </>
      )}
      <p role="status">{message}</p>
    </div>
  );
}
function PrintableCard({ card }: { card: IssuedCard }) {
  const ref = useRef<SVGSVGElement>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    import("jsbarcode")
      .then(({ default: render }) => {
        if (active && ref.current)
          render(ref.current, card.token, { format: "CODE128", displayValue: false });
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [card.token]);
  return (
    <section className="space-y-3">
      <div className="print-card max-w-full overflow-x-auto rounded-md border border-border bg-card p-4">
        <h2 className="font-semibold">{card.name}</h2>
        {error ? (
          <p role="alert">{t("cards.error")}</p>
        ) : (
          <svg ref={ref} role="img" aria-label={t("cards.barcode")} className="max-w-full" />
        )}
      </div>
      <Button variant="outline" disabled={error} onClick={() => window.print()}>
        <Printer />
        {t("cards.print")}
      </Button>
    </section>
  );
}
function CardPolicy({ value, busy, run }: Pick<CardViewProps, "value" | "busy" | "run">) {
  return (
    <section className="space-y-3 border-b border-border pb-6">
      <h2 className="text-lg font-semibold">{t("cards.policy")}</h2>
      <ul className="space-y-2 text-sm">
        <li>{t("cards.managerOnly")}</li>
        <li>{t("cards.immediate")}</li>
        <li>{t("cards.single")}</li>
      </ul>
      {value.approvedAt ? (
        <p className="text-success">
          {t("cards.approved")} · {new Date(value.approvedAt).toLocaleString("ar-KW")}
        </p>
      ) : value.canApprove ? (
        <Button disabled={busy} onClick={() => run("approve")}>
          {t("cards.approve")}
        </Button>
      ) : (
        <p>{t("cards.pending")}</p>
      )}
    </section>
  );
}
function CardList({ value, busy, confirm, setConfirm, run }: CardViewProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {value.staff.map((s) => (
        <article key={s.id} className="space-y-3 rounded-md border border-border bg-card p-4">
          <h2 className="font-semibold">{s.name}</h2>
          <p className="text-sm text-muted-foreground">{s.branchName}</p>
          <p className="text-sm">
            {t(s.phone ? "cards.phone" : s.cardId ? "cards.active" : "cards.none")}
          </p>
          {s.canIssue && (
            <div className="flex flex-wrap gap-2">
              {s.cardId ? (
                <>
                  <Button
                    variant="destructive"
                    disabled={busy}
                    onClick={() =>
                      confirm === s.cardId ? run("revoke", s.cardId ?? "") : setConfirm(s.cardId)
                    }
                  >
                    <X />
                    {t(confirm === s.cardId ? "cards.confirm" : "cards.revoke")}
                  </Button>
                  {confirm === s.cardId && (
                    <Button variant="outline" onClick={() => setConfirm(null)}>
                      {t("phone.cancel")}
                    </Button>
                  )}
                </>
              ) : (
                <Button
                  disabled={busy || s.phone || !value.approvedAt}
                  onClick={() => run("issue", s.id)}
                >
                  <CreditCard />
                  {t("cards.issue")}
                </Button>
              )}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
