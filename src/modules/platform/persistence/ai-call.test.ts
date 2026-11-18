// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { callConnector } from "./ai-call.server";

vi.mock("./credentials.server", () => ({
  loadCredential: async () => ({ access: "test-access" }),
}));

afterEach(() => vi.unstubAllGlobals());

function respond(...events: Array<Record<string, unknown>>) {
  const stream = events.map((event) => `data: ${JSON.stringify(event)}\r\n\r\n`).join("");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stream)));
  return callConnector("admin", "codex", "test-model", "system", "user");
}

describe("Codex Responses streams", () => {
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

describe("Chat Completions responses", () => {
  function reply(body: unknown) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
    return callConnector("admin", "openrouter", "test-model", "system", "user");
  }

  it("returns the answer from a completed choice after removing reasoning", async () => {
    await expect(
      reply({
        choices: [{ finish_reason: "stop", message: { content: "<think>Draft</think> Answer " } }],
      }),
    ).resolves.toBe("Answer");
  });

  it.each(["length", "content_filter", "tool_calls", "error", null, undefined])(
    "rejects a choice that ended with %s",
    async (finish_reason) => {
      await expect(
        reply({ choices: [{ finish_reason, message: { content: "Partial answer" } }] }),
      ).rejects.toThrow("AI_COMPLETION_INCOMPLETE");
    },
  );

  it.each([" ", "<think>Draft</think>", null, 123])(
    "rejects a completed choice without usable text (%s)",
    async (content) => {
      await expect(
        reply({ choices: [{ finish_reason: "stop", message: { content } }] }),
      ).rejects.toThrow("AI_COMPLETION_EMPTY");
    },
  );

  it("rejects a response without choices", async () => {
    await expect(reply({ choices: [] })).rejects.toThrow("AI_COMPLETION_INCOMPLETE");
  });
});
