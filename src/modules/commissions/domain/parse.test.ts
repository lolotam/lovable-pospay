import { describe, expect, test } from "vitest";
import { parseKwdToMills, parseMultipleToMilli, parsePercentToBp } from "./parse";

describe("parsePercentToBp (021 M0, zero floats)", () => {
  test.each([
    { text: "5", bp: 500n },
    { text: "12.5", bp: 1250n },
    { text: "0.25", bp: 25n },
    { text: "0", bp: 0n },
    { text: "100", bp: 10000n },
    { text: " 2.75 ", bp: 275n },
  ])("parses $text to $bp bp", ({ text, bp }) => {
    expect(parsePercentToBp(text)).toBe(bp);
  });

  test.each(["", "1.234", "12.5%", "abc", "1000"])("rejects %s", (text) => {
    expect(() => parsePercentToBp(text)).toThrow("INVALID_PERCENT");
  });
});

describe("parseMultipleToMilli (021 M0, zero floats)", () => {
  test.each([
    { text: "2", milli: 2000n },
    { text: "2.5", milli: 2500n },
    { text: "3.250", milli: 3250n },
    { text: "0.001", milli: 1n },
  ])("parses $text to $milli milli", ({ text, milli }) => {
    expect(parseMultipleToMilli(text)).toBe(milli);
  });

  test.each(["", "2.5001", "-2", "x", "1234"])("rejects %s", (text) => {
    expect(() => parseMultipleToMilli(text)).toThrow("INVALID_MULTIPLE");
  });
});

describe("parseKwdToMills", () => {
  test.each([
    { text: "2.000", mills: 2000n },
    { text: "12.345", mills: 12345n },
    { text: "500", mills: 500000n },
  ])("parses $text to $mills mills", ({ text, mills }) => {
    expect(parseKwdToMills(text)).toBe(mills);
  });

  test.each(["", "-1", "1.2345", "0.000.1"])("rejects %s", (text) => {
    expect(() => parseKwdToMills(text)).toThrow("INVALID_KWD");
  });
});
