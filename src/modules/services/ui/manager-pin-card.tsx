import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { setManagerPinFn } from "../functions/discount.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { t } from "@/i18n";
import { managerPinStatusQuery } from "./approval-queries";

/** بطاقة «رقمي السري»: الحالة وتعيين الرمز؛ لا يُعرض الرمز بعد الحفظ أبداً (020 B2). */
export function ManagerPinCard({ companyId }: { companyId: string }) {
  const setPin = useServerFn(setManagerPinFn);
  const cache = useQueryClient();
  const [pin, setPinValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const { data } = useQuery(managerPinStatusQuery(companyId));
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      await setPin({ data: { companyId, pin } });
      setPinValue("");
      setMessage(t("pin.saved"));
      await cache.invalidateQueries({ queryKey: ["manager-pin", companyId] });
    } catch {
      setMessage(t("pin.error"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="max-w-md space-y-3 rounded-md border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t("pin.title")}</h2>
        {data ? (
          <Badge variant={data.hasPin ? "secondary" : "outline"}>
            {t(data.hasPin ? "pin.status.has" : "pin.status.missing")}
          </Badge>
        ) : null}
      </div>
      <p className="text-muted-foreground">{t("pin.hint")}</p>
      <InputOTP
        maxLength={4}
        value={pin}
        onChange={setPinValue}
        aria-label={t("sessions.pinEnter")}
      >
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
          <InputOTPSlot index={2} />
          <InputOTPSlot index={3} />
        </InputOTPGroup>
      </InputOTP>
      <Button type="button" disabled={pin.length !== 4 || busy} onClick={() => void save()}>
        {t("pin.save")}
      </Button>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
