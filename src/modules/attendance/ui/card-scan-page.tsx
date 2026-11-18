import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ScanLine } from "lucide-react";
import { CompanyScope } from "@/modules/staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";
import { scanCardFn } from "../functions/card.functions";
export function CardScanPage() {
  return <CompanyScope title="cards.scanTitle">{(id) => <Scanner companyId={id} />}</CompanyScope>;
}
function useScanner({ companyId }: { companyId: string }) {
  const scan = useServerFn(scanCardFn);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  async function run(intent: "new_shift" | "check_out" | null = null) {
    if (busy) return;
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
      setMessage(t("cards.scanError"));
    } finally {
      setBusy(false);
    }
  }
  return { token, setToken, busy, prompt, setPrompt, message, run };
}
function Scanner({ companyId }: { companyId: string }) {
  const { token, setToken, busy, prompt, setPrompt, message, run } = useScanner({ companyId });
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!busy && !prompt) input.current?.focus();
  }, [busy, prompt]);
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
          disabled={busy || !!prompt}
          onChange={(e) => {
            setToken(e.target.value);
            setPrompt(null);
          }}
        />
      </label>
      {prompt ? (
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
