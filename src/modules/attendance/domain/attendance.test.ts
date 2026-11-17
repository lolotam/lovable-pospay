import { describe, expect, it } from "vitest";
import { locationException } from "./geofence";
import { decideScan, lateMinutes, workDate, type ShiftWindow } from "./scan-decision";
import { issueQrToken, verifyQrToken } from "./qr-token";

const branch = { latitude: 29.3759, longitude: 47.9774 };
const at = (iso: string) => new Date(`${iso}+03:00`);
const shift = (id: string, from: string, to: string): ShiftWindow => ({ id, startsAt: at(from), endsAt: at(to) });
const morning = shift("s1", "2026-11-18T06:00", "2026-11-18T14:00");

describe("D-12 geofence 150 m", () => {
  it("120 m away is inside", () => {
    expect(locationException({ latitude: 29.3759 + 120 / 111_320, longitude: 47.9774 }, branch, 150)).toBeNull();
  });
  it("300 m away is an exception, not a rejection", () => {
    expect(locationException({ latitude: 29.3759 + 300 / 111_320, longitude: 47.9774 }, branch, 150)).toBe("outside_geofence");
  });
  it("no location is an exception", () => {
    expect(locationException(null, branch, 150)).toBe("no_location");
  });
});

describe("D-12 grace 10 min", () => {
  const nine = shift("s", "2026-11-18T09:00", "2026-11-18T17:00");
  it("09:10 is not late", () => expect(lateMinutes(at("2026-11-18T09:10"), nine)).toBe(0));
  it("09:11 is 11 min late", () => expect(lateMinutes(at("2026-11-18T09:11"), nine)).toBe(11));
});

describe("D-53 open record rules", () => {
  const open = { id: "r1", checkInAt: at("2026-11-18T06:00"), shift: morning };
  it("scan 17:00 closes ok", () => {
    expect(decideScan({ now: at("2026-11-18T17:00"), open, nextShift: null, intent: null }))
      .toEqual({ kind: "check_out", recordId: "r1", status: "ok" });
  });
  it("scan 19:00 (5 h after shift end) closes late", () => {
    expect(decideScan({ now: at("2026-11-18T19:00"), open, nextShift: null, intent: null }))
      .toEqual({ kind: "check_out", recordId: "r1", status: "closed_late" });
  });
  it("scan after 18 h marks forgotten and checks in", () => {
    expect(decideScan({ now: at("2026-11-19T00:00"), open, nextShift: null, intent: null }).kind)
      .toBe("forgotten_then_check_in");
  });
});

describe("ق-6 overlapping shift (proposal)", () => {
  const open = { id: "r1", checkInAt: at("2026-11-18T06:00"), shift: morning };
  const evening = shift("s2", "2026-11-18T20:00", "2026-11-19T02:00");
  const base = { now: at("2026-11-18T20:00"), open, nextShift: evening };
  it("asks for intent", () => expect(decideScan({ ...base, intent: null })).toEqual({ kind: "needs_intent", recordId: "r1" }));
  it("new shift starts at 20:00 and previous becomes forgotten", () => {
    expect(decideScan({ ...base, intent: "new_shift" })).toEqual({ kind: "forgotten_then_check_in", forgottenId: "r1", shift: evening });
  });
  it("check-out closes the old record late", () => {
    expect(decideScan({ ...base, intent: "check_out" })).toEqual({ kind: "check_out", recordId: "r1", status: "closed_late" });
  });
});

describe("D-32 night shift belongs to check-in date", () => {
  it("22:00 Kuwait on the 18th is work date 2026-11-18", () => {
    expect(workDate(at("2026-11-18T22:00"), "Asia/Kuwait")).toBe("2026-11-18");
  });
});

describe("QR token", () => {
  const sign = async (m: string) => `sig_${m.replace(/\./g, "_")}`;
  it("valid within 60 s, rejected after", async () => {
    const token = await issueQrToken("b1", 1000, sign);
    expect(await verifyQrToken(token, 1060, sign)).toEqual({ branchId: "b1", issuedAt: 1000 });
    expect(await verifyQrToken(token, 1061, sign)).toBeNull();
  });
  it("forged signature is rejected", async () => {
    expect(await verifyQrToken("b1.1000.forged", 1000, sign)).toBeNull();
  });
});
