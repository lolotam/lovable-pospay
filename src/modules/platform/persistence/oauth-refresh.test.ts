// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { refreshCredential } from "./oauth-flows.server";

const expired = { access: "old-access", refresh: "old-refresh" };

describe("OAuth refresh deadlines", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("returns a rotated token whose response body arrives after the header deadline", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, { signal }: RequestInit) =>
          new Promise((resolve, reject) => {
            signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
            setTimeout(() => {
              const body = new ReadableStream({
                start(stream) {
                  signal?.addEventListener("abort", () => stream.error(signal.reason), {
                    once: true,
                  });
                  setTimeout(() => {
                    stream.enqueue(
                      new TextEncoder().encode(
                        JSON.stringify({
                          access_token: "new-access",
                          refresh_token: "new-refresh",
                        }),
                      ),
                    );
                    stream.close();
                  }, 2_000);
                },
              });
              resolve(new Response(body));
            }, 9_500);
          }),
      ),
    );

    const result = refreshCredential("codex", expired);
    await vi.advanceTimersByTimeAsync(11_500);
    await expect(result).resolves.toMatchObject({ access: "new-access", refresh: "new-refresh" });
  });

  it("aborts an incomplete successful response body at its own deadline", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (_url: string, { signal }: RequestInit) =>
          new Response(
            new ReadableStream({
              start(stream) {
                signal?.addEventListener("abort", () => stream.error(signal.reason), {
                  once: true,
                });
              },
            }),
          ),
      ),
    );

    const result = expect(refreshCredential("codex", expired)).rejects.toMatchObject({
      name: "TimeoutError",
    });
    await vi.advanceTimersByTimeAsync(5_000);
    await result;
  });

  it("aborts a request whose response headers never arrive", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, { signal }: RequestInit) =>
          new Promise((_, reject) => {
            signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
          }),
      ),
    );
    const result = expect(refreshCredential("codex", expired)).rejects.toMatchObject({
      name: "TimeoutError",
    });
    await vi.advanceTimersByTimeAsync(10_000);
    await result;
  });
});
