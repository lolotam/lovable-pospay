import { describe, expect, it } from "vitest";
import { CONNECTORS, findConnector, isAllowedModel, needsRefresh } from "./providers";

describe("platform connectors", () => {
  it("offers the four account sign-ins from prolifepharma", () => {
    expect(CONNECTORS.filter((c) => c.kind === "account").map((c) => c.id)).toEqual([
      "codex", "kimi_coding", "minimax_coding", "zai_coding",
    ]);
  });
  it("rejects unknown connectors and models", () => {
    expect(findConnector("lovable_gateway")).toBeNull();
    expect(isAllowedModel("codex", "gpt-5.1-codex")).toBe(true);
    expect(isAllowedModel("codex", "glm-4.6")).toBe(false);
    expect(isAllowedModel("resend", "anything")).toBe(false);
  });
  it("refreshes tokens with under 10 minutes left", () => {
    expect(needsRefresh(1_000_000 + 599_000, 1_000_000)).toBe(true);
    expect(needsRefresh(1_000_000 + 600_000, 1_000_000)).toBe(false);
    expect(needsRefresh(null, 1_000_000)).toBe(false);
  });
});
