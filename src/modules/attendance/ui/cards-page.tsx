import { useEffect, useReducer, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Printer, CreditCard, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { CompanyScope } from "@/modules/staff";
import { approveCardsFn, issueCardFn, revokeCardFn } from "../functions/card.functions";
import { cardQuery } from "./cards-query";
import type { IssuedCard } from "../card.contracts";
export function CardsPage() {
  const [switchLocked, setSwitchLocked] = useState(false);
  const [issuedByScope, setIssuedByScope] = useState(() => new Map<string, IssuedCard>());
  const mutations = useCardMutations();
  function rememberIssued(scope: string, card: IssuedCard | null) {
    setIssuedByScope((previous) => {
      const next = new Map(previous);
      if (card) next.set(scope, card);
      else next.delete(scope);
      return next;
    });
  }
  return (
    <CompanyScope title="cards.title" switchLocked={switchLocked}>
      {(id, userId) => {
        const scope = JSON.stringify([userId, id]);
        return (
          <CardActions
            companyId={id}
            userId={userId}
            issued={issuedByScope.get(scope)}
            mutation={mutations(scope)}
            onIssuedChange={(card) => rememberIssued(scope, card)}
            onSwitchLockChange={setSwitchLocked}
          />
        );
      }}
    </CompanyScope>
  );
}

function useCardMutations() {
  const inFlight = useRef(new Set<string>());
  const [, refresh] = useReducer((version: number) => version + 1, 0);
  return (scope: string) => ({
    busy: inFlight.current.has(scope),
    start() {
      if (inFlight.current.has(scope)) return false;
      inFlight.current.add(scope);
      refresh();
      return true;
    },
    finish() {
      inFlight.current.delete(scope);
      refresh();
    },
  });
}

type CardActionScope = Pick<
  CardActionsProps,
  "companyId" | "userId" | "issued" | "onIssuedChange" | "mutation"
>;

function useCards({ companyId, userId, issued, onIssuedChange, mutation }: CardActionScope) {
  const { data, fetchStatus, isFetchedAfterMount, refetch } = useQuery(
    cardQuery(companyId, userId),
  );
  const isFetching = !isFetchedAfterMount || fetchStatus !== "idle";
  const localMutation = useCardMutations()("policy");
  const lock = mutation ?? localMutation;
  const [confirm, setConfirm] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const approve = useServerFn(approveCardsFn),
    issue = useServerFn(issueCardFn),
    revoke = useServerFn(revokeCardFn);
  async function run(action: "approve" | "issue" | "revoke", id = "") {
    if (isFetching || issued || !lock.start()) return;
    setMessage("");
    let saved = false;
    try {
      const scope = { companyId, expectedUserId: userId };
      if (action === "approve") await approve({ data: scope });
      else if (action === "issue")
        onIssuedChange?.(await issue({ data: { ...scope, staffId: id } }));
      else await revoke({ data: { ...scope, cardId: id } });
      setConfirm(null);
      saved = true;
    } catch {
      setMessage(t(action === "issue" ? "cards.issueUnconfirmed" : "cards.error"));
    } finally {
      lock.finish();
      void refetch().then(
        ({ data: refreshed }) => {
          if (saved) {
            const verified = refreshed?.value && !refreshed.error;
            setMessage(t(verified ? "ops.saved" : "cards.savedRefreshFailed"));
          }
        },
        () => {
          if (saved) setMessage(t("cards.savedRefreshFailed"));
        },
      );
    }
  }
  return {
    data,
    refetch,
    busy: lock.busy,
    isFetching,
    confirm,
    setConfirm,
    issued,
    dismissIssued: () => onIssuedChange?.(null),
    message,
    run,
  };
}
type CardsState = ReturnType<typeof useCards>;
type CardViewProps = Pick<CardsState, "busy" | "run" | "confirm" | "setConfirm"> & {
  value: NonNullable<NonNullable<CardsState["data"]>["value"]>;
};
export interface CardActionsProps {
  companyId: string;
  userId: string;
  policyOnly?: boolean;
  issued?: IssuedCard | undefined;
  mutation?: ReturnType<ReturnType<typeof useCardMutations>> | undefined;
  onIssuedChange?: ((card: IssuedCard | null) => void) | undefined;
  onSwitchLockChange?: (locked: boolean) => void;
}
export function CardActions({
  companyId,
  userId,
  policyOnly = false,
  issued: currentCard,
  mutation,
  onIssuedChange,
  onSwitchLockChange,
}: CardActionsProps) {
  const {
    data,
    refetch,
    busy,
    isFetching,
    confirm,
    setConfirm,
    issued,
    dismissIssued,
    message,
    run,
  } = useCards({ companyId, userId, issued: currentCard, onIssuedChange, mutation });
  useEffect(() => {
    onSwitchLockChange?.(busy || !!issued);
    return () => onSwitchLockChange?.(false);
  }, [busy, issued, onSwitchLockChange]);
  const value = isFetching ? null : data?.value;
  const canPrint = value?.staff.some((staff) => staff.canIssue && staff.cardId === issued?.cardId);
  return (
    <div className="space-y-6">
      <CardRosterStatus data={data} isFetching={isFetching} refetch={refetch} />
      {value && <CardPolicy value={value} busy={busy || isFetching || !!issued} run={run} />}
      {value && !policyOnly && (
        <>
          <CardList
            value={value}
            busy={busy || isFetching || !!issued}
            confirm={confirm}
            setConfirm={setConfirm}
            run={run}
          />
          {!value.staff.length && <p>{t("ops.empty")}</p>}
        </>
      )}
      {!policyOnly && issued && (
        <>
          {canPrint && <PrintableCard card={issued} />}
          {value && !canPrint && <p role="status">{t("cards.issuedInactive")}</p>}
          <Button type="button" variant="outline" onClick={dismissIssued}>
            {t("cards.dismissIssued")}
          </Button>
        </>
      )}
      <p role="status">{message}</p>
    </div>
  );
}

function CardRosterStatus({
  data,
  isFetching,
  refetch,
}: Pick<CardsState, "data" | "isFetching" | "refetch">) {
  if (isFetching) return <p role="status">{t("phone.loading")}</p>;
  if (!data?.error) return null;
  return (
    <div className="space-y-2">
      <p role="alert">{t(data.error)}</p>
      <Button type="button" onClick={() => void refetch()}>
        {t("ops.retryLoad")}
      </Button>
    </div>
  );
}

function PrintableCard({ card }: { card: IssuedCard }) {
  const ref = useRef<SVGSVGElement>(null);
  const [error, setError] = useState(false);
  const [readyToken, setReadyToken] = useState<string>();
  useEffect(() => {
    let active = true;
    import("jsbarcode")
      .then(({ default: render }) => {
        if (active && ref.current) {
          render(ref.current, card.token, { format: "CODE128", displayValue: false });
          setReadyToken(card.token);
        }
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
      <Button
        variant="outline"
        disabled={error || readyToken !== card.token}
        onClick={() => window.print()}
      >
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
