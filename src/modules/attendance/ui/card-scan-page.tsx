import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ScanLine } from "lucide-react";
import { CompanyScope } from "@/modules/staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";
import {
  cardRequestInput,
  cardTokenInput,
  type CardRequest,
  type CardScanRequest,
} from "../card.contracts";
import { scanCardFn, settleCardScanFn } from "../functions/card.functions";
export function CardScanPage() {
  const [switchLocked, setSwitchLocked] = useState(false);
  return (
    <CompanyScope title="cards.scanTitle" switchLocked={switchLocked}>
      {(id, userId) => (
        <Scanner companyId={id} userId={userId} onSwitchLockChange={setSwitchLocked} />
      )}
    </CompanyScope>
  );
}
type RecordedScan = Extract<Awaited<ReturnType<typeof scanCardFn>>, { status: "recorded" }>["scan"];

function scanResultMessage({ name, result }: RecordedScan) {
  const key =
    result.outcome === "checked_in"
      ? "attend.checkedIn"
      : result.outcome === "checked_out"
        ? "attend.checkedOut"
        : "cards.error";
  return name + " \u00b7 " + t(key);
}

function createScanRequest(
  companyId: string,
  expectedUserId: string,
  token: string,
  intent: CardScanRequest["intent"],
  prompt: string | null,
): CardScanRequest {
  return {
    companyId,
    expectedUserId,
    token,
    intent,
    requestId: crypto.randomUUID(),
    requestedAt: Date.now(),
    ...(prompt ? { promptedRecordId: prompt } : {}),
  };
}

function usePendingScan(companyId: string, userId: string) {
  const key = "pospay:card-scan:" + JSON.stringify([userId, companyId]);
  const [pending, setPending] = useState<CardRequest | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key);
      const attempt = raw ? cardRequestInput.parse(JSON.parse(raw)) : null;
      if (attempt && (attempt.companyId !== companyId || attempt.expectedUserId !== userId))
        throw new Error("Unexpected scanner recovery scope");
      setPending(attempt);
      setReady(true);
    } catch {
      setReady(false);
    }
  }, [companyId, key, userId]);

  function remember(request: CardRequest) {
    try {
      const attempt = cardRequestInput.parse(request);
      sessionStorage.setItem(key, JSON.stringify(attempt));
      setPending(attempt);
      return true;
    } catch {
      return false;
    }
  }

  function forget() {
    sessionStorage.removeItem(key);
    setPending(null);
  }

  return { pending, ready, remember, forget };
}

function useScanner(companyId: string, userId: string) {
  const scan = useServerFn(scanCardFn);
  const settle = useServerFn(settleCardScanFn);
  const inFlight = useRef(false);
  const current = useRef<CardScanRequest | null>(null);
  const { pending, ready, remember, forget } = usePendingScan(companyId, userId);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function submit(attempt: CardRequest, request: CardScanRequest | null, retry: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    try {
      current.current = request;
      const response = request ? await scan({ data: request }) : await settle({ data: attempt });
      forget();
      current.current = null;
      setPrompt(null);
      if (
        response.status === "recorded" &&
        response.scan.result.outcome === "needs_intent" &&
        request
      ) {
        setPrompt(response.scan.result.recordId);
        return;
      }
      setToken("");
      setMessage(tallyScanMessage(response, retry));
    } catch {
      setPrompt(null);
      setMessage(t(retry ? "cards.statusUnavailable" : "cards.confirmScanOutcome"));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function run(intent: CardScanRequest["intent"] = null) {
    if (inFlight.current || !ready || pending || !token) return;
    if (cardTokenInput.safeParse(token).success) {
      const request = createScanRequest(companyId, userId, token, intent, prompt);
      if (remember(request)) void submit(request, request, false);
      else setMessage(t("cards.scanStorageUnavailable"));
    } else {
      setToken("");
      setMessage(t("cards.scanError"));
    }
  }

  const controls = { token, setToken, busy, prompt, setPrompt, message };
  function recover() {
    if (pending) void submit(pending, current.current, true);
  }
  return { ...controls, pending, ready, run, recover };
}

function tallyScanMessage(response: Awaited<ReturnType<typeof scanCardFn>>, retry: boolean) {
  if (response.status === "recorded" && response.scan.result.outcome !== "needs_intent")
    return scanResultMessage(response.scan);
  if (response.status === "cancelled" || response.status === "recorded")
    return t("cards.scanCancelled");
  return t(retry ? "cards.statusDiscontinued" : "cards.scanError");
}

type ScannerProps = {
  companyId: string;
  userId: string;
  onSwitchLockChange: (locked: boolean) => void;
};

function Scanner({ companyId, userId, onSwitchLockChange }: ScannerProps) {
  const { token, setToken, busy, prompt, setPrompt, message, pending, ready, recover, run } =
    useScanner(companyId, userId);
  const uncertain = !!pending;
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    onSwitchLockChange(busy || uncertain || !!prompt);
    return () => onSwitchLockChange(false);
  }, [busy, uncertain, prompt, onSwitchLockChange]);
  useEffect(() => {
    if (ready && !busy && !prompt && !uncertain) input.current?.focus();
  }, [busy, prompt, ready, uncertain]);
  return (
    <form
      className="max-w-xl space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        run();
      }}
    >
      <label className="block space-y-2">
        <span>{t("cards.scanInput")}</span>
        <Input
          ref={input}
          autoComplete="off"
          value={uncertain ? "" : token}
          disabled={!ready || busy || !!prompt || uncertain}
          onChange={(e) => {
            setToken(e.target.value);
            setPrompt(null);
          }}
        />
      </label>
      {pending ? (
        <Button type="button" disabled={busy} onClick={recover}>
          {t("cards.checkScanStatus")}
        </Button>
      ) : prompt ? (
        <ScanIntentActions
          busy={busy}
          onSelect={run}
          onCancel={() => {
            setPrompt(null);
            setToken("");
          }}
        />
      ) : (
        <Button disabled={!ready || busy || !token}>
          <ScanLine />
          {t("cards.scan")}
        </Button>
      )}
      <p role="status">{message || (!ready ? t("cards.scanStorageUnavailable") : "")}</p>
    </form>
  );
}

function ScanIntentActions({
  busy,
  onSelect,
  onCancel,
}: {
  busy: boolean;
  onSelect: (intent: "new_shift" | "check_out") => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <Button type="button" disabled={busy} onClick={() => onSelect("new_shift")}>
        {t("attend.newShift")}
      </Button>
      <Button type="button" variant="outline" disabled={busy} onClick={() => onSelect("check_out")}>
        {t("attend.checkOut")}
      </Button>
      <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
        {t("phone.cancel")}
      </Button>
    </div>
  );
}
