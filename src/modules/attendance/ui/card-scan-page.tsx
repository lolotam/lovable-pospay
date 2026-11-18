import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ScanLine } from "lucide-react";
import { CompanyScope } from "@/modules/staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";
import { scanCardFn } from "../functions/card.functions";
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
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  async function run(intent: "new_shift" | "check_out" | null = null) {
    if (busy || uncertain || !token) return;
    setBusy(true);
    setMessage("");
    try {
      const r = await scan({
        data: { companyId, token, intent, ...(prompt ? { promptedRecordId: prompt } : {}) },
      });
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
      setToken("");
      setUncertain(true);
      setMessage(t("cards.confirmScanOutcome"));
    } finally {
      setBusy(false);
    }
  }
  return { token, setToken, busy, prompt, setPrompt, message, uncertain, setUncertain, run };
}
function Scanner({
  companyId,
  onSwitchLockChange,
}: {
  companyId: string;
  onSwitchLockChange: (locked: boolean) => void;
}) {
  const { token, setToken, busy, prompt, setPrompt, message, uncertain, setUncertain, run } =
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
          value={token}
          disabled={busy || !!prompt || uncertain}
          onChange={(e) => {
            setToken(e.target.value);
            setPrompt(null);
          }}
        />
      </label>
      {uncertain ? (
        <Button type="button" onClick={() => setUncertain(false)}>
          {t("cards.scanOutcomeReviewed")}
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
