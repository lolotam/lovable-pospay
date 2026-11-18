import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
import { pendingScanKey, readPendingScan, tallyScanMessage } from "./card-scan-storage";
export function CardScanPage() {
  const [switchLocked, setSwitchLocked] = useState(false);
  return (
    <CompanyScope title="cards.scanTitle" switchLocked={switchLocked}>
      {(id, userId, available) => (
        <Scanner
          companyId={id}
          userId={userId}
          available={available}
          onSwitchLockChange={setSwitchLocked}
        />
      )}
    </CompanyScope>
  );
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

function usePendingScan(companyId: string, userId: string, available: boolean) {
  const [pending, setPending] = useState<CardRequest | null>(null);
  const [ready, setReady] = useState(false);
  const [displayedRequestId, acknowledge] = useState<string | null>(null);
  useLayoutEffect(() => {
    if (!available || !displayedRequestId) return;
    acknowledge(null);
    try {
      const stored = readPendingScan();
      if (stored?.requestId === displayedRequestId) {
        sessionStorage.removeItem(pendingScanKey);
        setPending(null);
      } else {
        setPending(stored);
      }
    } catch {
      setReady(false);
    }
  }, [available, displayedRequestId]);
  useEffect(() => {
    try {
      setPending(readPendingScan());
      setReady(true);
    } catch {
      setReady(false);
    }
  }, [companyId, userId]);

  function remember(request: CardRequest) {
    try {
      const attempt = cardRequestInput.parse(request);
      if (readPendingScan()) return false;
      sessionStorage.setItem(pendingScanKey, JSON.stringify(attempt));
      setPending(attempt);
      return true;
    } catch {
      return false;
    }
  }

  const blocked =
    !!pending && (pending.companyId !== companyId || pending.expectedUserId !== userId);
  return { pending: blocked ? null : pending, blocked, ready, remember, acknowledge };
}

function useScanner(companyId: string, userId: string, available: boolean) {
  const scan = useServerFn(scanCardFn);
  const settle = useServerFn(settleCardScanFn);
  const inFlight = useRef(false);
  const recovery = usePendingScan(companyId, userId, available);
  const { pending, blocked, ready, remember, acknowledge } = recovery;
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
      const response = request ? await scan({ data: request }) : await settle({ data: attempt });
      if (response.status === "unverified") return setMessage(t("cards.scanSessionUnverified"));
      acknowledge(attempt.requestId);
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
    if (inFlight.current || !available || !ready || blocked || pending || !token) return;
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
    if (available && pending) void submit(pending, null, true);
  }
  return { ...controls, pending, blocked, ready, run, recover };
}

type ScannerProps = {
  companyId: string;
  userId: string;
  available: boolean;
  onSwitchLockChange: (locked: boolean) => void;
};

function Scanner({ companyId, userId, available, onSwitchLockChange }: ScannerProps) {
  const state = useScanner(companyId, userId, available);
  const { token, setToken, busy, prompt, setPrompt, message } = state;
  const { pending, blocked, ready, recover, run } = state;
  const uncertain = !!pending;
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    onSwitchLockChange(busy || uncertain || !!prompt);
    return () => onSwitchLockChange(false);
  }, [busy, uncertain, prompt, onSwitchLockChange]);
  useEffect(() => {
    if (available && ready && !blocked && !busy && !prompt && !uncertain) input.current?.focus();
  }, [available, blocked, busy, prompt, ready, uncertain]);
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
          disabled={!ready || blocked || busy || !!prompt || uncertain}
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
        <Button disabled={!ready || blocked || busy || !token}>
          <ScanLine />
          {t("cards.scan")}
        </Button>
      )}
      <p role="status">{message || scannerStatus(ready, blocked)}</p>
    </form>
  );
}

function scannerStatus(ready: boolean, blocked: boolean) {
  if (!ready) return t("cards.scanStorageUnavailable");
  return blocked ? t("cards.scanOriginalScope") : "";
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
