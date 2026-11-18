import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { t } from "@/i18n";
import { CardsPage } from "./cards-page";

const { getCards, issue, scope } = vi.hoisted(() => ({
  getCards: vi.fn(),
  issue: vi.fn(),
  scope: { revalidating: false },
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (handler: unknown) => handler }));
vi.mock("@/modules/staff", () => ({
  CompanyScope: ({ children }: { children: (id: string, userId: string) => ReactNode }) =>
    scope.revalidating ? null : children("company", "manager"),
}));
vi.mock("../functions/card.functions", () => ({
  getCardsFn: getCards,
  issueCardFn: issue,
  approveCardsFn: vi.fn(),
  revokeCardFn: vi.fn(),
}));

it("keeps an issued card recoverable after same-account session revalidation", async () => {
  const roster = {
    approvedAt: "2026-11-01T00:00:00Z",
    canApprove: true,
    staff: [{ id: "staff", name: "Employee", branchName: "Branch", cardId: null, canIssue: true }],
  };
  getCards.mockReset().mockResolvedValue(roster);
  const issued = { cardId: "new-card", name: "Employee", token: "c".repeat(48) };
  let finishIssue!: (card: typeof issued) => void;
  issue.mockReturnValueOnce(
    new Promise((resolve) => {
      finishIssue = resolve;
    }),
  );
  const cache = new QueryClient();
  const page = () => (
    <QueryClientProvider client={cache}>
      <CardsPage />
    </QueryClientProvider>
  );
  const view = render(page());
  fireEvent.click(await screen.findByRole("button", { name: t("cards.issue") }));
  scope.revalidating = true;
  view.rerender(page());
  expect(screen.queryByRole("button", { name: t("cards.print") })).not.toBeInTheDocument();
  scope.revalidating = false;
  view.rerender(page());
  const issueButton = await screen.findByRole("button", { name: t("cards.issue") });
  expect(issueButton).toBeDisabled();
  fireEvent.click(issueButton);
  getCards.mockResolvedValue({ ...roster, staff: [{ ...roster.staff[0], cardId: issued.cardId }] });
  await act(async () => finishIssue(issued));
  expect(await screen.findByRole("button", { name: t("cards.print") })).toBeInTheDocument();
  expect(issue).toHaveBeenCalledTimes(1);
  expect(issue).toHaveBeenCalledWith({
    data: { companyId: "company", expectedUserId: "manager", staffId: "staff" },
  });
});

it.each(["retry", "dismiss", "revoked"] as const)(
  "lets the operator %s after a failed post-issuance refresh",
  async (action) => {
    const roster = {
      approvedAt: "2026-11-01T00:00:00Z",
      canApprove: true,
      staff: [
        { id: "staff", name: "Employee", branchName: "Branch", cardId: null, canIssue: true },
      ],
    };
    getCards.mockReset().mockResolvedValueOnce(roster).mockRejectedValue(new Error("Unavailable"));
    issue.mockReset().mockResolvedValueOnce({
      cardId: "new-card",
      name: "Employee",
      token: "c".repeat(48),
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CardsPage />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: t("cards.issue") }));
    const retry = await screen.findByRole("button", { name: t("ops.retryLoad") });
    const dismiss = screen.getByRole("button", { name: t("cards.dismissIssued") });
    expect(screen.queryByRole("button", { name: t("cards.print") })).toBeNull();

    getCards.mockResolvedValue(
      action === "retry"
        ? { ...roster, staff: [{ ...roster.staff[0], cardId: "new-card" }] }
        : roster,
    );
    if (action === "dismiss") {
      fireEvent.click(dismiss);
      fireEvent.click(retry);
      expect(await screen.findByRole("button", { name: t("cards.issue") })).toBeEnabled();
      expect(screen.queryByRole("button", { name: t("cards.print") })).toBeNull();
      return;
    }
    fireEvent.click(retry);
    if (action === "revoked") {
      expect(await screen.findByText(t("cards.issuedInactive"))).toBeVisible();
      expect(screen.queryByRole("button", { name: t("cards.print") })).toBeNull();
      expect(screen.getByRole("button", { name: t("cards.dismissIssued") })).toBeVisible();
      return;
    }
    expect(await screen.findByRole("button", { name: t("cards.print") })).toBeVisible();
    expect(issue).toHaveBeenCalledTimes(1);
  },
);
