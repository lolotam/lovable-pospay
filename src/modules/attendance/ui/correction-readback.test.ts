import { expect, it } from "vitest";
import { assertCorrectionReadback } from "./correction-readback";

it("rejects a failed readback instead of declaring successful verification", () => {
  expect(() =>
    assertCorrectionReadback(
      { records: [], error: "correction.error" },
      "record",
      "2026-11-18T11:00:00.000Z",
    ),
  ).toThrow("READBACK_FAILED");
});
it("requires the saved correction in the refreshed records", () => {
  expect(() =>
    assertCorrectionReadback(
      { records: [{ id: "record", correctedAt: null }], error: null },
      "record",
      "2026-11-18T11:00:00.000Z",
    ),
  ).toThrow("READBACK_FAILED");
});
