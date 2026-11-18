import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ScanLine } from "lucide-react";
import { CompanyScope } from "@/modules/staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";
import { cardTokenInput } from "../card.contracts";
import { getCardStatusFn, scanCardFn } from "../functions/card.functions";
export function CardScanPage() {
  const [switchLocked, setSwitchLocked] = useState(false);
  return (
    <CompanyScope title="cards.scanTitle" switchLocked={switchLocked}>
      {(id) => <Scanner companyId={id} onSwitchLockChange={setSwitchLocked} />}
    </CompanyScope>
  );
}
function useScanner({ companyId }: { companyId: string }) {
  const scan = useServerFn(scanCardFn);
  const fetchStatus = useServerFn(getCardStatusFn);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  async function run(intent: "new_shift" | "check_out" | null = null) {
    if (busy || uncertain || !token) return;
    if (!cardTokenInput.safeParse(token).success) {
      setToken("");
      setMessage(t("cards.scanError"));
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await scan({
        data: { companyId, token, intent, ...(prompt ? { promptedRecordId: prompt } : {}) },
      });
      if (response.status === "rejected") {
        setPrompt(null);
        setToken("");
        setMessage(t("cards.scanError"));
        return;
      }
      const r = response.scan;
      if (r.result.outcome === "needs_intent") setPrompt(r.result.recordId);
      else {
        setPrompt(null);
        setToken("");
        setMessage(
          `${r.name} · ${t(r.result.outcome === "checked_in" ? "attend.checkedIn" : r.result.outcome === "checked_out" ? "attend.checkedOut" : "cards.error")}`,
        );
      }
    } catch {
      setPrompt(null);
      setUncertain(true);
      setMessage(t("cards.confirmScanOutcome"));
    } finally {
      setBusy(false);
    }
  }
  async function confirmStatus() {
    if (busy || !uncertain) return;
    setBusy(true);
    try {
      const status = await fetchStatus({ data: { companyId, token } });
      setMessage(
        status.name + " \u00b7 " + t(status.checkedIn ? "cards.currentlyIn" : "cards.currentlyOut"),
      );
      setToken("");
      setUncertain(false);
    } catch {
      setMessage(t("cards.statusUnavailable"));
    } finally {
      setBusy(false);
    }
  }
  return { token, setToken, busy, prompt, setPrompt, message, uncertain, confirmStatus, run };
}
function Scanner({
  companyId,
  onSwitchLockChange,
}: {
  companyId: string;
  onSwitchLockChange: (locked: boolean) => void;
}) {
  const { token, setToken, busy, prompt, setPrompt, message, uncertain, confirmStatus, run } =
    useScanner({ companyId });
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    onSwitchLockChange(busy || uncertain || !!prompt);
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
      {uncertain ? (
        <Button type="button" disabled={busy} onClick={confirmStatus}>
          {t("cards.checkScanStatus")}
        </Button>
      ) : prompt ? (
        <div className="flex flex-wrap gap-3">
          <Button type="button" disabled={busy} onClick={() => run("new_shift")}>
            {t("attend.newShift")}
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => run("check_out")}>
            {t("attend.checkOut")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setPrompt(null);
              setToken("");
            }}
          >
            {t("phone.cancel")}
          </Button>
        </div>
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
