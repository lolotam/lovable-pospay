import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReceptionQr } from "./use-reception-qr";

const rpc = vi.hoisted(() => vi.fn());
const bitmap = vi.hoisted(() => vi.fn());
// RPC and canvas encoding are external boundaries; the real lifecycle runs.
vi.mock("qrcode", () => ({ default: { toDataURL: bitmap } }));

const branch = "11111111-1111-4111-8111-111111111111";
const response = { token: `${branch}.100.signature`, branchName: "Salon A", expiresInSeconds: 60 };

async function advance(ms: number) {
  await act(() => vi.advanceTimersByTimeAsync(ms));
}

describe("reception QR validity", () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance"],
    });
    rpc.mockReset();
    bitmap.mockReset().mockResolvedValue("data:image/png;base64,fresh");
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("hides a 60-second QR when the next refresh hangs", async () => {
    rpc.mockResolvedValueOnce(response).mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useReceptionQr(branch, rpc));
    await advance(0);
    expect(result.current.image).toBe("data:image/png;base64,fresh");
    await advance(60_000);
    expect(result.current.image).toBeNull();
  });

  it("charges slow bitmap rendering against the original lifetime", async () => {
    rpc
      .mockResolvedValueOnce({ ...response, expiresInSeconds: 2 })
      .mockImplementation(() => new Promise(() => {}));
    bitmap.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve("late-image"), 1_500)),
    );
    const { result } = renderHook(() => useReceptionQr(branch, rpc));
    await advance(1_500);
    expect(result.current.image).toBeNull();
    expect(result.current.failed).toBe("expired");
  });

  it.each([5_000, 8_001])(
    "charges RPC delay of %i ms against the original lifetime",
    async (delay) => {
      rpc
        .mockImplementationOnce(
          () => new Promise((resolve) => setTimeout(() => resolve(response), delay)),
        )
        .mockImplementation(() => new Promise(() => {}));
      const { result } = renderHook(() => useReceptionQr(branch, rpc));
      await advance(delay);
      if (delay < 8_000) {
        expect(result.current.branchName).toBe("Salon A");
        expect(result.current.image).toBe("data:image/png;base64,fresh");
        await advance(59_000 - delay);
      }
      expect(result.current.image).toBeNull();
      expect(result.current.failed).toBe(delay < 8_000 ? "expired" : "unavailable");
    },
  );

  it("ignores a bitmap completed after changing branch", async () => {
    let complete: (value: string) => void = () => {};
    rpc.mockResolvedValueOnce(response).mockImplementation(() => new Promise(() => {}));
    bitmap.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const { result, rerender } = renderHook(({ id }) => useReceptionQr(id, rpc), {
      initialProps: { id: branch },
    });
    await advance(0);
    rerender({ id: "22222222-2222-4222-8222-222222222222" });
    await act(async () => complete("old-bitmap"));
    expect(result.current.image).toBeNull();
    expect(result.current.branchName).toBe("");
  });

  it("stops requests and focus recovery after unmount", async () => {
    rpc.mockResolvedValue(response);
    const { unmount } = renderHook(() => useReceptionQr(branch, rpc));
    await advance(0);
    unmount();
    await advance(150_000);
    act(() => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("hides the previous branch immediately and ignores its delayed response", async () => {
    let resolveOld: (value: typeof response) => void = () => {};
    rpc
      .mockResolvedValueOnce(response)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockImplementation(() => new Promise(() => {}));
    const { result, rerender } = renderHook(({ id }) => useReceptionQr(id, rpc), {
      initialProps: { id: branch },
    });
    await advance(50_000);
    bitmap.mockImplementation(() => new Promise(() => {}));
    rerender({ id: "22222222-2222-4222-8222-222222222222" });
    expect(result.current.image).toBeNull();
    bitmap.mockResolvedValue("old-image");
    await act(async () => resolveOld(response));
    expect(result.current.image).toBeNull();
  });

  it("cancels a hung refresh, retries, and ignores its late response", async () => {
    let complete: (value: typeof response) => void = () => {};
    rpc
      .mockResolvedValueOnce(response)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            complete = resolve;
          }),
      )
      .mockResolvedValue({ ...response, branchName: "Recovered" });
    const { result } = renderHook(() => useReceptionQr(branch, rpc));
    await advance(57_999);
    expect(rpc).toHaveBeenCalledTimes(2);
    const signal = rpc.mock.calls[1]?.[0].signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    await advance(1);
    expect(signal.aborted).toBe(true);
    await advance(3_000);
    expect(rpc).toHaveBeenCalledTimes(3);
    expect(result.current.branchName).toBe("Recovered");
    await act(async () => complete(response));
    expect(result.current.branchName).toBe("Recovered");
  });

  it("retries an initial timeout within three seconds without overlapping requests", async () => {
    rpc.mockImplementationOnce(() => new Promise(() => {})).mockResolvedValue(response);
    const { result } = renderHook(() => useReceptionQr(branch, rpc));
    await advance(8_000);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(result.current.failed).toBe("unavailable");
    await advance(3_000);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(result.current.image).toBe("data:image/png;base64,fresh");
  });

  it("keeps an unexpired QR on a transient network error and retries promptly", async () => {
    rpc
      .mockResolvedValueOnce(response)
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue({ ...response, branchName: "Recovered" });
    const { result } = renderHook(() => useReceptionQr(branch, rpc));
    await advance(50_000);
    expect(result.current.image).toBe("data:image/png;base64,fresh");
    expect(result.current.failed).toBe(false);
    await advance(3_000);
    expect(result.current.branchName).toBe("Recovered");
  });

  it("expires a QR when the timer delay includes a fractional millisecond", async () => {
    const now = performance.now.bind(performance);
    let offset = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now() + offset);
    try {
      rpc.mockResolvedValueOnce(response).mockImplementation(() => new Promise(() => {}));
      bitmap.mockImplementationOnce(async () => {
        offset = 0.5;
        return "fractional-image";
      });
      const { result } = renderHook(() => useReceptionQr(branch, rpc));
      await advance(58_999);
      expect(result.current.image).toBe("fractional-image");
      await advance(1);
      expect(result.current.image).toBeNull();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("does not resurrect a previous QR when returning to its branch", async () => {
    rpc.mockResolvedValueOnce(response).mockImplementation(() => new Promise(() => {}));
    const { result, rerender } = renderHook(({ id }) => useReceptionQr(id, rpc), {
      initialProps: { id: branch },
    });
    await advance(0);
    rerender({ id: "22222222-2222-4222-8222-222222222222" });
    rerender({ id: branch });
    expect(result.current.image).toBeNull();
  });

  it("clears failed refresh data and restores only the next fresh response", async () => {
    rpc
      .mockResolvedValueOnce(response)
      .mockRejectedValueOnce(new Error("FORBIDDEN"))
      .mockResolvedValue(response);
    const { result } = renderHook(() => useReceptionQr(branch, rpc));
    await advance(50_000);
    expect(result.current.image).toBeNull();
    expect(result.current.failed).toBe("forbidden");
    await advance(50_000);
    expect(result.current.image).toBe("data:image/png;base64,fresh");
    expect(result.current.failed).toBe(false);
  });

  it("clears expired QR on focus even when expiry timers were paused", async () => {
    rpc.mockResolvedValueOnce(response).mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useReceptionQr(branch, rpc));
    await advance(0);
    vi.spyOn(performance, "now").mockReturnValue(61_000);
    act(() => window.dispatchEvent(new Event("focus")));
    expect(result.current.image).toBeNull();
    vi.restoreAllMocks();
  });
});
