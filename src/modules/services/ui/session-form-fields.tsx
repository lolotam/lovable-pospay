import { Input } from "@/components/ui/input";
import { t } from "@/i18n";
import type { SessionFormDto } from "../contracts";
import { kwd } from "./session-format";

export const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3";

export function SessionSelectors({
  services,
  staff,
  serviceId,
  staffId,
  onService,
  onStaff,
}: {
  services: SessionFormDto["services"];
  staff: SessionFormDto["staff"];
  serviceId: string;
  staffId: string;
  onService: (id: string) => void;
  onStaff: (id: string) => void;
}) {
  return (
    <>
      <label className="block space-y-2">
        <span>{t("sessions.service")}</span>
        <select
          className={selectClass}
          value={serviceId}
          onChange={(e) => onService(e.target.value)}
          required
        >
          <option value="">{t("sessions.choose")}</option>
          {services.map((s) => (
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
          value={staffId}
          onChange={(e) => onStaff(e.target.value)}
          required
          disabled={!serviceId}
        >
          <option value="">{t("sessions.choose")}</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

export function SessionClientFields({
  name,
  phone,
  onName,
  onPhone,
}: {
  name: string;
  phone: string;
  onName: (value: string) => void;
  onPhone: (value: string) => void;
}) {
  return (
    <>
      <label className="block space-y-2">
        <span>{t("sessions.clientName")}</span>
        <Input value={name} onChange={(e) => onName(e.target.value)} required maxLength={120} />
      </label>
      <label className="block space-y-2">
        <span>{t("sessions.clientPhone")}</span>
        <Input
          dir="ltr"
          inputMode="tel"
          value={phone}
          onChange={(e) => onPhone(e.target.value)}
          required
          minLength={8}
          maxLength={24}
        />
      </label>
    </>
  );
}

/** السعر والسبب ظاهران دائماً حتى بحد 0؛ السبب إلزامي عند أي تعديل للسعر (020 A4، A6). */
export function PriceFields({
  cap,
  price,
  reason,
  set,
}: {
  cap: number;
  price: string;
  reason: string;
  set: (k: "price" | "reason") => (v: string) => void;
}) {
  return (
    <fieldset className="space-y-3 rounded-md border border-border p-3">
      <legend className="px-1 text-sm">
        {cap > 0 ? `${t("sessions.discountCap")} ${cap}%` : t("sessions.priceChange")}
      </legend>
      <label className="block space-y-2">
        <span>{t("sessions.price")}</span>
        <Input
          dir="ltr"
          inputMode="decimal"
          value={price}
          onChange={(e) => set("price")(e.target.value)}
        />
      </label>
      {price.trim() !== "" && (
        <label className="block space-y-2">
          <span>{t("sessions.reason")}</span>
          <Input
            value={reason}
            maxLength={200}
            onChange={(e) => set("reason")(e.target.value)}
            required
          />
        </label>
      )}
    </fieldset>
  );
}

/** يعرض سعر القائمة الحالي للخدمة المختارة. */
export function ListPriceHint({ mills }: { mills: string | undefined }) {
  if (!mills) return null;
  return (
    <p dir="ltr">
      {kwd(mills)} {t("ops.kwd")}
    </p>
  );
}
