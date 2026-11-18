import { expect, it } from "vitest";
import { parsePrice } from "./price";
it("converts 25.125 KWD to 25125 mills", () => expect(parsePrice("25.125")).toBe(25125n));
it("accepts zero price", () => expect(parsePrice("0.000")).toBe(0n));
it("rejects fractional mills", () => expect(() => parsePrice("1.0001")).toThrow());
it("rejects negative price", () => expect(() => parsePrice("-1.000")).toThrow());
