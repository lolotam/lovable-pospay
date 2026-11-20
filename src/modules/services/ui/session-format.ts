import { formatKwd } from "@/shared/kernel/money";

/** يعرض نص ملّيم من الخادم كمبلغ KWD بثلاث خانات دون أي رقم عائم. */
export function kwd(mills: string): string {
  return formatKwd(BigInt(mills));
}

/** يخفي رقم العميلة ويبقي آخر ثلاثة أرقام فقط (D-43). */
export function maskPhone(last3: string | null): string | null {
  return last3 === null ? null : `•••${last3}`;
}

/** يعرض لحظة ISO بوقت فرع الشركة. */
export function formatBranchLocal(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    dateStyle: "short",
    timeStyle: "short",
    hourCycle: "h23",
  }).format(new Date(iso));
}

/** يحول لحظة ISO إلى قيمة حقل datetime-local بتوقيت فرع الشركة. */
export function branchLocalInputValue(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}`;
}
