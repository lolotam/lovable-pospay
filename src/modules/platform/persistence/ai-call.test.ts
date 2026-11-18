// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { callConnector } from "./ai-call.server";

vi.mock("./credentials.server", () => ({
  loadCredential: async () => ({ access: "test-access" }),
}));

function respond(...events: Array<Record<string, unknown>>) {
  const stream = events.map((event) => `data: ${JSON.stringify(event)}\r\n\r\n`).join("");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stream)));
  return callConnector("admin", "codex", "test-model", "system", "user");
}

describe("Codex Responses streams", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns text when the response completes", async () => {
    await expect(
      respond(
        { type: "response.output_text.delta", delta: "Complete " },
        { type: "response.output_text.delta", delta: "answer" },
        { type: "response.completed" },
      ),
    ).resolves.toBe("Complete answer");
  });

  it.each(["response.failed", "error"])("rejects partial text followed by %s", async (type) => {
    await expect(
      respond({ type: "response.output_text.delta", delta: "Partial" }, { type }),
    ).rejects.toThrow("CODEX_STREAM_FAILED");
  });

  it("rejects a stream with partial text and no successful completion event", async () => {
    await expect(respond({ type: "response.output_text.delta", delta: "Partial" })).rejects.toThrow(
      "CODEX_STREAM_INCOMPLETE",
    );
  });

  it("rejects an incomplete terminal event", async () => {
    await expect(respond({ type: "response.incomplete" })).rejects.toThrow(
      "CODEX_STREAM_INCOMPLETE",
    );
  });
});
