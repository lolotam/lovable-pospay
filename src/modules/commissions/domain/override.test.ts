import { describe, expect, test } from "vitest";
import { resolveOverride } from "./plan";
import type { ServiceOverrideRow } from "./plan";

const at = (iso: string) => new Date(iso);
const fixed = (mills: bigint) => ({ kind: "fixed_mills" as const, mills });
const staffRate = (rateBp: bigint): ServiceOverrideRow => ({
  id: "staff-rate",
  staffId: "huda",
  serviceId: "service-b",
  effectiveFrom: at("2027-03-01T00:00:00Z"),
  override: { kind: "rate_bp", rateBp },
});
const serviceFixed = (mills: bigint): ServiceOverrideRow => ({
  id: "service-fixed",
  staffId: null,
  serviceId: "service-b",
  effectiveFrom: at("2027-03-01T00:00:00Z"),
  override: fixed(mills),
});

describe("resolveOverride (021 O1/O2/O5)", () => {
  test("returns the staff row when it is present", () => {
    const history = [serviceFixed(3000n), staffRate(1500n)];
    expect(resolveOverride(history, "service-b", at("2027-03-05T10:00:00Z"))).toEqual({
      kind: "rate_bp",
      rateBp: 1500n,
    });
  });

  test("falls through a staff clear to the service-wide row (O2)", () => {
    const history: ServiceOverrideRow[] = [
      serviceFixed(3000n),
      {
        id: "staff-clear",
        staffId: "huda",
        serviceId: "service-b",
        effectiveFrom: at("2027-03-02T00:00:00Z"),
        override: { kind: "clear" },
      },
      staffRate(1500n),
    ];
    expect(resolveOverride(history, "service-b", at("2027-03-03T10:00:00Z"))).toEqual(fixed(3000n));
  });

  test("falls through a service clear to the plan (null)", () => {
    const history: ServiceOverrideRow[] = [
      staffRate(1500n),
      {
        id: "staff-clear",
        staffId: "huda",
        serviceId: "service-b",
        effectiveFrom: at("2027-03-02T00:00:00Z"),
        override: { kind: "clear" },
      },
      {
        id: "service-clear",
        staffId: null,
        serviceId: "service-b",
        effectiveFrom: at("2027-03-03T00:00:00Z"),
        override: { kind: "clear" },
      },
    ];
    expect(resolveOverride(history, "service-b", at("2027-03-04T10:00:00Z"))).toBeNull();
  });

  test("ignores rows effective after the line time and other services (O5)", () => {
    const history: ServiceOverrideRow[] = [
      {
        id: "future",
        staffId: "huda",
        serviceId: "service-b",
        effectiveFrom: at("2027-03-10T14:00:00Z"),
        override: staffRate(1500n).override,
      },
      {
        id: "other-service",
        staffId: "huda",
        serviceId: "service-a",
        effectiveFrom: at("2027-03-01T00:00:00Z"),
        override: staffRate(9000n).override,
      },
    ];
    expect(resolveOverride(history, "service-b", at("2027-03-05T10:00:00Z"))).toBeNull();
  });

  test("picks the latest effectiveFrom and breaks ties by id", () => {
    const history: ServiceOverrideRow[] = [
      {
        id: "a",
        staffId: "huda",
        serviceId: "service-b",
        effectiveFrom: at("2027-03-01T00:00:00Z"),
        override: { kind: "fixed_mills", mills: 1000n },
      },
      {
        id: "b",
        staffId: "huda",
        serviceId: "service-b",
        effectiveFrom: at("2027-03-01T00:00:00Z"),
        override: { kind: "fixed_mills", mills: 2000n },
      },
      {
        id: "c",
        staffId: "huda",
        serviceId: "service-b",
        effectiveFrom: at("2027-03-02T00:00:00Z"),
        override: { kind: "fixed_mills", mills: 3000n },
      },
    ];
    expect(resolveOverride(history, "service-b", at("2027-03-01T12:00:00Z"))).toEqual(fixed(2000n));
    expect(resolveOverride(history, "service-b", at("2027-03-02T12:00:00Z"))).toEqual(fixed(3000n));
  });

  test("uses the service-wide row when no staff row exists", () => {
    const history = [serviceFixed(3000n)];
    expect(resolveOverride(history, "service-b", at("2027-03-05T10:00:00Z"))).toEqual(fixed(3000n));
  });
});
