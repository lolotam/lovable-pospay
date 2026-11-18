import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { t } from "@/i18n";
import { CardScanPage } from "./card-scan-page";

const { scan, status } = vi.hoisted(() => ({ scan: vi.fn(), status: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (handler: unknown) => handler }));
vi.mock("@/modules/staff", () => ({
  CompanyScope: ({ children }: { children: (id: string) => ReactNode }) => children("company"),
}));
vi.mock("../functions/card.functions", () => ({ scanCardFn: scan, getCardStatusFn: status }));

it("allows another card after a terminal status response and preserves uncertainty after a transport error", async () => {
  scan.mockRejectedValueOnce(new Error("Connection lost"));
  status
    .mockRejectedValueOnce(new Error("Connection lost"))
    .mockResolvedValueOnce({ status: "unavailable" });
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
});
