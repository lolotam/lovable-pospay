import { describe, expect, it } from "vitest";
import { checkDiscount } from "./discount";

describe("checkDiscount (ق-1 + Q3)", () => {
  it("allows list price without permission", () => {
    expect(checkDiscount(20000n, 20000n, 0, "")).toBeNull();
  });
  it("blocks any discount when no permission is granted", () => {
    expect(checkDiscount(20000n, 19999n, 0, "vip")).toBe("DISCOUNT_OVER_LIMIT");
  });
  it("allows exactly the granted 10% limit and rejects beyond it", () => {
    expect(checkDiscount(20000n, 18000n, 10, "vip")).toBeNull();
    expect(checkDiscount(20000n, 17999n, 10, "vip")).toBe("DISCOUNT_OVER_LIMIT");
  });
  it("rejects a negative price", () => {
    expect(checkDiscount(20000n, -1n, 100, "x")).toBe("INVALID_PRICE");
  });
  it("allows a surcharge above the list price only with a reason (020 A4)", () => {
    expect(checkDiscount(20000n, 20001n, 0, "شعر طويل")).toBeNull();
    expect(checkDiscount(20000n, 30000n, 0, " ")).toBe("DISCOUNT_REASON_REQUIRED");
  });
  it("applies the 100.000 list and 10% cap acceptance numbers", () => {
    expect(checkDiscount(100000n, 90000n, 10, "vip")).toBeNull();
    expect(checkDiscount(100000n, 85000n, 10, "vip")).toBe("DISCOUNT_OVER_LIMIT");
    expect(checkDiscount(100000n, 100001n, 10, "vip")).toBeNull();
  });
  it("requires a reason for a discount before the cap check", () => {
    expect(checkDiscount(20000n, 19000n, 100, " ")).toBe("DISCOUNT_REASON_REQUIRED");
    expect(checkDiscount(20000n, 19999n, 0, " ")).toBe("DISCOUNT_REASON_REQUIRED");
  });
});
