import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { t } from "@/i18n";
import { CardScanPage } from "./card-scan-page";

const { scan, settle, operator } = vi.hoisted(() => ({
  scan: vi.fn(),
  settle: vi.fn(),
  operator: { id: "reception", available: true },
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (handler: unknown) => handler }));
vi.mock("@/modules/staff", () => ({
  CompanyScope: ({
    children,
  }: {
    children: (id: string, userId: string, available: boolean) => ReactNode;
  }) => (
    <div hidden={!operator.available}>
      {children("30000000-0000-4000-8000-000000000001", operator.id, operator.available)}
    </div>
  ),
}));
vi.mock("../functions/card.functions", () => ({ scanCardFn: scan, settleCardScanFn: settle }));

afterEach(() => {
  operator.id = "reception";
  operator.available = true;
});

it("allows another card after a terminal status response and preserves uncertainty after a transport error", async () => {
  scan.mockRejectedValueOnce(new Error("Connection lost"));
  settle
    .mockRejectedValueOnce(new Error("Connection lost"))
    .mockResolvedValueOnce({ status: "rejected" });
  render(<CardScanPage />);
  const input = screen.getByRole("textbox", { name: t("cards.scanInput") });
  fireEvent.change(input, { target: { value: "a".repeat(48) } });
  fireEvent.click(screen.getByRole("button", { name: t("cards.scan") }));

  const verify = await screen.findByRole("button", { name: t("cards.checkScanStatus") });
  expect(input).toBeDisabled();
  fireEvent.click(verify);
  expect(await screen.findByText(t("cards.statusUnavailable"))).toBeInTheDocument();
  expect(input).toBeDisabled();

  fireEvent.click(verify);
  expect(await screen.findByText(t("cards.statusDiscontinued"))).toBeInTheDocument();
  expect(input).toBeEnabled();
  expect(input).toHaveValue("");
  expect(scan).toHaveBeenCalledTimes(1);
  expect(settle).toHaveBeenCalledTimes(2);
  expect(settle.mock.calls[0]).toEqual(settle.mock.calls[1]);
  expect(settle.mock.calls[0]?.[0].data.requestId).toBe(scan.mock.calls[0]?.[0].data.requestId);
  expect(settle.mock.calls[0]?.[0].data).not.toHaveProperty("token");
});

it("recovers after leaving the scanner without storing the card token", async () => {
  scan.mockReset().mockRejectedValueOnce(new Error("Connection lost"));
  settle.mockReset().mockResolvedValueOnce({ status: "cancelled" });
  const card = "b".repeat(48);
  const first = render(<CardScanPage />);
  fireEvent.change(screen.getByRole("textbox", { name: t("cards.scanInput") }), {
    target: { value: card },
  });
  fireEvent.click(screen.getByRole("button", { name: t("cards.scan") }));
  await screen.findByText(t("cards.confirmScanOutcome"));
  const original = scan.mock.calls[0]?.[0].data;
  const key = sessionStorage.key(0);
  if (!key) throw new Error("Expected a stored recovery request");
  const stored = sessionStorage.getItem(key);
  expect(stored).not.toContain(card);
  expect(stored).toContain(original.requestId);

  first.unmount();
  render(<CardScanPage />);
  expect(screen.getByRole("textbox", { name: t("cards.scanInput") })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: t("cards.checkScanStatus") }));
  expect(await screen.findByText(t("cards.scanCancelled"))).toBeInTheDocument();
  expect(settle).toHaveBeenCalledWith({
    data: {
      companyId: original.companyId,
      expectedUserId: original.expectedUserId,
      requestId: original.requestId,
      requestedAt: original.requestedAt,
    },
  });
  expect(sessionStorage.getItem(key)).toBeNull();
  expect(scan).toHaveBeenCalledTimes(1);
});

it.each(["unmounted", "hidden", "restored"] as const)(
  "preserves a receipt until the result is shown when the scanner is %s",
  async (state) => {
    let finishScan!: (reply: unknown) => void;
    scan.mockReset().mockReturnValueOnce(
      new Promise((resolve) => {
        finishScan = resolve;
      }),
    );
    settle.mockReset().mockResolvedValueOnce({
      status: "recorded",
      scan: { name: "Employee", result: { outcome: "checked_in" } },
    });
    const first = render(<CardScanPage />);
    fireEvent.change(screen.getByRole("textbox", { name: t("cards.scanInput") }), {
      target: { value: "c".repeat(48) },
    });
    fireEvent.click(screen.getByRole("button", { name: t("cards.scan") }));
    const key = sessionStorage.key(0);
    if (!key) throw new Error("Expected a stored recovery request");
    const stored = sessionStorage.getItem(key);
    if (state === "unmounted") {
      first.unmount();
    } else {
      operator.available = false;
      first.rerender(<CardScanPage />);
    }
    await act(async () =>
      finishScan({
        status: "recorded",
        scan: { name: "Employee", result: { outcome: "checked_in" } },
      }),
    );
    expect(sessionStorage.getItem(key)).toBe(stored);

    if (state === "restored") {
      expect(screen.getByText(new RegExp(t("attend.checkedIn")))).not.toBeVisible();
      operator.available = true;
      first.rerender(<CardScanPage />);
      expect(screen.getByText(new RegExp(t("attend.checkedIn")))).toBeVisible();
      expect(sessionStorage.getItem(key)).toBeNull();
      expect(settle).not.toHaveBeenCalled();
      return;
    }
    if (state === "hidden") {
      first.unmount();
      operator.available = true;
    }
    render(<CardScanPage />);
    fireEvent.click(screen.getByRole("button", { name: t("cards.checkScanStatus") }));
    expect(await screen.findByText(new RegExp(t("attend.checkedIn")))).toBeInTheDocument();
    expect(sessionStorage.getItem(key)).toBeNull();
  },
);

it("keeps the original request blocked through an expired session", async () => {
  let finishOriginal!: (value: unknown) => void;
  scan.mockReset().mockReturnValueOnce(
    new Promise((resolve) => {
      finishOriginal = resolve;
    }),
  );
  settle
    .mockReset()
    .mockResolvedValueOnce({ status: "unverified" })
    .mockResolvedValueOnce({
      status: "recorded",
      scan: { name: "Employee", result: { outcome: "checked_in" } },
    });
  const first = render(<CardScanPage />);
  fireEvent.change(screen.getByRole("textbox", { name: t("cards.scanInput") }), {
    target: { value: "d".repeat(48) },
  });
  fireEvent.click(screen.getByRole("button", { name: t("cards.scan") }));
  const key = sessionStorage.key(0);
  if (!key) throw new Error("Expected a stored recovery request");
  const stored = sessionStorage.getItem(key);
  first.unmount();

  operator.id = "other-reception";
  const other = render(<CardScanPage />);
  expect(screen.getByRole("textbox", { name: t("cards.scanInput") })).toBeDisabled();
  expect(screen.getByText(t("cards.scanOriginalScope"))).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: t("cards.checkScanStatus") })).toBeNull();
  expect(settle).not.toHaveBeenCalled();
  expect(sessionStorage.getItem(key)).toBe(stored);
  other.unmount();
  operator.id = "reception";

  render(<CardScanPage />);
  const recover = screen.getByRole("button", { name: t("cards.checkScanStatus") });
  fireEvent.click(recover);
  expect(await screen.findByText(t("cards.scanSessionUnverified"))).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: t("cards.scanInput") })).toBeDisabled();
  expect(sessionStorage.getItem(key)).toBe(stored);
  await act(async () =>
    finishOriginal({
      status: "recorded",
      scan: { name: "Employee", result: { outcome: "checked_in" } },
    }),
  );
  expect(sessionStorage.getItem(key)).toBe(stored);

  fireEvent.click(recover);
  expect(await screen.findByText(new RegExp(t("attend.checkedIn")))).toBeInTheDocument();
  expect(settle.mock.calls[0]).toEqual(settle.mock.calls[1]);
  expect(sessionStorage.getItem(key)).toBeNull();
  expect(scan).toHaveBeenCalledTimes(1);
});
