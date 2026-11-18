import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "@/i18n";
import { findConnector } from "../domain/providers";
import type { LoginPollDto } from "../contracts";
import { ConnectorRow } from "./connector-row";

const { start, poll } = vi.hoisted(() => ({ start: vi.fn(), poll: vi.fn() }));
vi.mock("../functions/connectors.functions", () => ({
  startAccountLoginFn: start,
  pollAccountLoginFn: poll,
}));

describe("connector sign-in polling", () => {
  const provider = findConnector("kimi_coding");
  const status = { connected: [], defaultProvider: null, defaultModel: null };

  beforeEach(() => {
    vi.useFakeTimers();
    start.mockReset().mockResolvedValue({
      loginId: "login",
      verificationUrl: "https://example.com/verify",
      userCode: null,
      expiresInSec: 180,
    });
    poll.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  function show(onChange = vi.fn()) {
    if (!provider) throw new Error("Missing test connector");
    return render(<ConnectorRow def={provider} onChange={onChange} status={status} />);
  }

  it("schedules the next poll only after the previous request settles", async () => {
    let complete: (result: LoginPollDto) => void = () => {};
    poll
      .mockReturnValueOnce(
        new Promise<LoginPollDto>((resolve) => {
          complete = resolve;
        }),
      )
      .mockResolvedValue({ status: "complete" });
    show();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: t("conn.connect") }));
    });
    await act(() => vi.advanceTimersByTimeAsync(15_000));
    expect(poll).toHaveBeenCalledTimes(1);

    await act(async () => complete({ status: "pending" }));
    await act(() => vi.advanceTimersByTimeAsync(3_000));
    expect(poll).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("status")).toHaveTextContent(t("conn.done"));
  });

  it("cancels an active poll and ignores its late response on unmount", async () => {
    let complete: (result: LoginPollDto) => void = () => {};
    poll.mockReturnValueOnce(
      new Promise<LoginPollDto>((resolve) => {
        complete = resolve;
      }),
    );
    const onChange = vi.fn();
    const { unmount } = show(onChange);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: t("conn.connect") }));
    });
    await act(() => vi.advanceTimersByTimeAsync(3_000));
    const signal = poll.mock.calls[0]?.[0].signal as AbortSignal;

    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => complete({ status: "complete" }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
