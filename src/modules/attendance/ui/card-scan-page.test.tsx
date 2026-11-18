import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { t } from "@/i18n";
import { CardScanPage } from "./card-scan-page";

const { scan } = vi.hoisted(() => ({ scan: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (handler: unknown) => handler }));
vi.mock("@/modules/staff", () => ({
  CompanyScope: ({ children }: { children: (id: string, userId: string) => ReactNode }) =>
    children("company", "reception"),
}));
vi.mock("../functions/card.functions", () => ({ scanCardFn: scan }));

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
