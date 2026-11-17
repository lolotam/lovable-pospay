import ar from "./ar.json";
import en from "./en.json";

export type Locale = "ar" | "en";
export type MessageKey = keyof typeof ar;
const messages: Record<Locale, Record<MessageKey, string>> = { ar, en };

export function t(key: MessageKey, locale: Locale = "ar"): string {
  return messages[locale][key] ?? key;
}
