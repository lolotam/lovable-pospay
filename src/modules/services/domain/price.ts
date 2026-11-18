/** يحوّل السعر النصي إلى فلوس صحيحة دون أرقام عائمة. */
export function parsePrice(value: string): bigint {
  if (!/^\d{1,12}(\.\d{1,3})?$/.test(value)) throw new Error("INVALID_PRICE");
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0"));
}
