import { describe, expect, it } from "vitest";
import { canIssueCard } from "./card-policy";
describe("approved barcode rules", () => {
  it("only branch managers issue", () => {
    expect(
      canIssueCard({ manager: false, denied: false, approved: true, phone: false, card: false }),
    ).toBe(false);
  });
  it("active phone blocks cards", () => {
    expect(
      canIssueCard({ manager: true, denied: false, approved: true, phone: true, card: false }),
    ).toBe(false);
  });
  it("approval and no other method permit issue", () => {
    expect(
      canIssueCard({ manager: true, denied: false, approved: true, phone: false, card: false }),
    ).toBe(true);
  });
  it("deny wins", () => {
    expect(
      canIssueCard({ manager: true, denied: true, approved: true, phone: false, card: false }),
    ).toBe(false);
  });
  it("another card blocks issue", () => {
    expect(
      canIssueCard({ manager: true, denied: false, approved: true, phone: false, card: true }),
    ).toBe(false);
  });
});
