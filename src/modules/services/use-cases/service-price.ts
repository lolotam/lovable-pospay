import { parsePrice } from "../domain/price";
/** يحوّل مدخل السعر المعتمد للحفظ. */
export function servicePrice(value: string): bigint {
  return parsePrice(value);
}
