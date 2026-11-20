import { describe, expect, it } from "vitest";
import { isValidPin } from "./pin";

describe("isValidPin (020 B2)", () => {
  it.each(["1234", "0000", "9021"])("accepts four ASCII digits like %s", (pin) => {
    expect(isValidPin(pin)).toBe(true);
  });
  it.each(["", "123", "12345", "12a4", "12 4", "١٢٣٤", "-123"])("rejects %s", (pin) => {
    expect(isValidPin(pin)).toBe(false);
  });
});
