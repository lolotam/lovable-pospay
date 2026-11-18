// @vitest-environment node
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

describe("authored code lint coverage", () => {
  const eslint = new ESLint();

  it.each([".oj-cache/v1/deps/probe.mjs", ".tanstack/probe.ts"])(
    "does not lint generated dependency or routing cache %s",
    async (filePath) => {
      expect(await eslint.isPathIgnored(filePath)).toBe(true);
    },
  );

  it("still lints authored tests", async () => {
    expect(await eslint.isPathIgnored("src/test/probe.ts")).toBe(false);
  });

  it("still rejects forbidden imports in authored source", async () => {
    const reports = await eslint.lintText('import "server-only";\n', {
      filePath: "src/test/probe.ts",
    });
    expect(reports[0]?.messages.some((message) => message.ruleId === "no-restricted-imports")).toBe(
      true,
    );
    expect(reports[0]?.errorCount).toBeGreaterThan(0);
  });
});
