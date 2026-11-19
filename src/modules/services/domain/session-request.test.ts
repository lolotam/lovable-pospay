import { describe, expect, it } from "vitest";
import { sessionRequestPayload } from "./session-request";

const base = {
  serviceId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
  staffId: "BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB",
  clientName: " Noura ",
  normalizedPhone: "96555551234",
  occurredAt: "2026-11-18T08:00",
  priceMills: 12500n,
  reason: " vip ",
};
const expected =
  '["session-request-v1","aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","Noura","96555551234","2026-11-18T08:00","12500","vip"]';

describe("sessionRequestPayload", () => {
  it("is stable across id case and trimmed fields", () => {
    expect(sessionRequestPayload(base)).toBe(expected);
    expect(
      sessionRequestPayload({
        ...base,
        serviceId: base.serviceId.toLowerCase(),
        staffId: base.staffId.toLowerCase(),
        clientName: "Noura",
        reason: "vip",
      }),
    ).toBe(expected);
  });

  it.each([
    ["service", { serviceId: "CCCCCCCC-CCCC-4CCC-8CCC-CCCCCCCCCCCC" }],
    ["staff", { staffId: "CCCCCCCC-CCCC-4CCC-8CCC-CCCCCCCCCCCC" }],
    ["client name", { clientName: "Mona" }],
    ["phone", { normalizedPhone: "96555554321" }],
    ["time", { occurredAt: "2026-11-18T08:01" }],
    ["price", { priceMills: 12000n }],
    ["reason", { reason: "member" }],
  ])("changes when the %s changes", (_field, change) => {
    expect(sessionRequestPayload({ ...base, ...change })).not.toBe(expected);
  });

  it("distinguishes no entered price from entering the list price", () => {
    expect(sessionRequestPayload({ ...base, priceMills: undefined })).not.toBe(
      sessionRequestPayload(base),
    );
  });
});
