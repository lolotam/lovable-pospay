import { useRef, useState } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Save } from "lucide-react";
import { CompanyScope } from "@/modules/staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";
import { getSessionFormFn, recordSessionFn } from "../functions/session.functions";

const formQuery = (companyId: string) =>
  queryOptions({
    queryKey: ["session-form", companyId],
    queryFn: async () => {
      try {
        return await getSessionFormFn({ data: { companyId } });
      } catch {
        return null;
      }
    },
  });
const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3";
export function SessionsPage() {
  return (
    <CompanyScope title="sessions.title">{(id) => <SessionForm companyId={id} />}</CompanyScope>
  );
}
function useSessionForm(companyId: string) {
  const { data } = useSuspenseQuery(formQuery(companyId));
  const record = useServerFn(recordSessionFn);
  const [f, setF] = useState({
    serviceId: "",
    staffId: "",
    clientName: "",
    clientPhone: "",
    at: "",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const request = useRef<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => {
    request.current = null;
    setF((p) => ({ ...p, [k]: v, ...(k === "serviceId" ? { staffId: "" } : {}) }));
  };
  async function submit() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await record({
        data: {
          companyId,
          serviceId: f.serviceId,
          staffId: f.staffId,
          clientName: f.clientName,
          clientPhone: f.clientPhone,
          occurredAt: f.at,
          requestId: (request.current ??= crypto.randomUUID()),
        },
      });
      request.current = null;
      setF((p) => ({ ...p, clientName: "", clientPhone: "", at: "" }));
      setMessage(t("sessions.saved"));
    } catch {
      setMessage(t("sessions.error"));
    } finally {
      setBusy(false);
    }
  }
  return { data, f, set, busy, message, submit };
}
function SessionForm({ companyId }: { companyId: string }) {
  const { data, f, set, busy, message, submit } = useSessionForm(companyId);
  if (!data?.canRecord) return <p role="alert">{t("ops.forbidden")}</p>;
  const service = data.services.find((s) => s.id === f.serviceId);
  const staff = data.staff.filter((s) => service?.staffIds.includes(s.id));
  const selectedStaff = staff.find((s) => s.id === f.staffId);
  const price = service
    ? `${BigInt(service.priceMills) / 1000n}.${(BigInt(service.priceMills) % 1000n).toString().padStart(3, "0")}`
    : "";
  return (
    <form
      className="max-w-xl space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label className="block space-y-2">
        <span>{t("sessions.service")}</span>
        <select
          className={selectClass}
          value={f.serviceId}
          onChange={(e) => set("serviceId")(e.target.value)}
          required
        >
          <option value="">{t("sessions.choose")}</option>
          {data.services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-2">
        <span>{t("sessions.staff")}</span>
        <select
          className={selectClass}
          value={f.staffId}
          onChange={(e) => set("staffId")(e.target.value)}
          required
          disabled={!service}
        >
          <option value="">{t("sessions.choose")}</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-2">
        <span>{t("sessions.clientName")}</span>
        <Input
          value={f.clientName}
          onChange={(e) => set("clientName")(e.target.value)}
          required
          maxLength={120}
        />
      </label>
      <label className="block space-y-2">
        <span>{t("sessions.clientPhone")}</span>
        <Input
          dir="ltr"
          inputMode="tel"
          value={f.clientPhone}
          onChange={(e) => set("clientPhone")(e.target.value)}
          required
          minLength={8}
          maxLength={24}
        />
      </label>
      <label className="block space-y-2">
        <span>
          {t("sessions.at")} {selectedStaff && <bdi>{selectedStaff.timeZone}</bdi>}
        </span>
        <Input
          dir="ltr"
          type="datetime-local"
          disabled={!selectedStaff || busy}
          value={f.at}
          onChange={(e) => set("at")(e.target.value)}
          required
        />
      </label>
      {service && (
        <p dir="ltr">
          {price} {t("ops.kwd")}
        </p>
      )}
      <Button disabled={busy}>
        <Save />
        {t("sessions.save")}
      </Button>
      <p role="status">{message}</p>
    </form>
  );
}
