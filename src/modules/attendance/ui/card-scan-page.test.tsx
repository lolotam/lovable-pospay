import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { t } from "@/i18n";
import { CardScanPage } from "./card-scan-page";

const { scan, settle } = vi.hoisted(() => ({ scan: vi.fn(), settle: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (handler: unknown) => handler }));
vi.mock("@/modules/staff", () => ({
  CompanyScope: ({ children }: { children: (id: string, userId: string) => ReactNode }) =>
    children("30000000-0000-4000-8000-000000000001", "reception"),
}));
vi.mock("../functions/card.functions", () => ({ scanCardFn: scan, settleCardScanFn: settle }));

it("allows another card after a terminal status response and preserves uncertainty after a transport error", async () => {
  scan
    .mockRejectedValueOnce(new Error("Connection lost"))
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
  expect(scan).toHaveBeenCalledTimes(3);
  expect(scan.mock.calls[1]).toEqual(scan.mock.calls[0]);
  expect(scan.mock.calls[2]).toEqual(scan.mock.calls[0]);
});

it("recovers after leaving the scanner without storing the card token", async () => {
  scan.mockReset().mockRejectedValueOnce(new Error("Connection lost"));
  settle.mockResolvedValueOnce({ status: "cancelled" });
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
