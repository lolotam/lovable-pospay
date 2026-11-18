import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ScanLine } from "lucide-react";
import { CompanyScope } from "@/modules/staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";
import { cardTokenInput, type CardScanRequest } from "../card.contracts";
import { scanCardFn } from "../functions/card.functions";
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
    ...(prompt ? { promptedRecordId: prompt } : {}),
  };
}

function useScanner(companyId: string, userId: string) {
  const scan = useServerFn(scanCardFn);
  const inFlight = useRef(false);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<CardScanRequest | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function submit(request: CardScanRequest, retry: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    try {
      const response = await scan({ data: request });
      setPending(null);
      if (response.status === "recorded" && response.scan.result.outcome === "needs_intent") {
        setPrompt(response.scan.result.recordId);
        return;
      }
      setPrompt(null);
      setToken("");
      setMessage(
        response.status === "recorded"
          ? scanResultMessage(response.scan)
          : t(retry ? "cards.statusDiscontinued" : "cards.scanError"),
      );
    } catch {
      setPrompt(null);
      setPending(request);
      setMessage(t(retry ? "cards.statusUnavailable" : "cards.confirmScanOutcome"));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function run(intent: CardScanRequest["intent"] = null) {
    if (pending || !token) return;
    if (!cardTokenInput.safeParse(token).success) {
      setToken("");
      setMessage(t("cards.scanError"));
      return;
    }
    void submit(createScanRequest(companyId, userId, token, intent, prompt), false);
  }

  return { token, setToken, busy, prompt, setPrompt, message, pending, submit, run };
}

type ScannerProps = {
  companyId: string;
  userId: string;
  onSwitchLockChange: (locked: boolean) => void;
};

function Scanner({ companyId, userId, onSwitchLockChange }: ScannerProps) {
  const { token, setToken, busy, prompt, setPrompt, message, pending, submit, run } = useScanner(
    companyId,
    userId,
  );
  const uncertain = !!pending;
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    onSwitchLockChange(busy || uncertain || !!prompt);
    return () => onSwitchLockChange(false);
  }, [busy, uncertain, prompt, onSwitchLockChange]);
  useEffect(() => {
    if (!busy && !prompt && !uncertain) input.current?.focus();
  }, [busy, prompt, uncertain]);
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
          disabled={busy || !!prompt || uncertain}
          onChange={(e) => {
            setToken(e.target.value);
            setPrompt(null);
          }}
        />
      </label>
      {pending ? (
        <Button type="button" disabled={busy} onClick={() => submit(pending, true)}>
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
        <Button disabled={busy || !token}>
          <ScanLine />
          {t("cards.scan")}
        </Button>
      )}
      <p role="status">{message}</p>
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
