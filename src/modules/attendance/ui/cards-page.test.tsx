import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
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
  getCards.mockResolvedValue({
    approvedAt: "2026-11-01T00:00:00Z",
    canApprove: true,
    staff: [{ id: "staff", name: "Employee", branchName: "Branch", cardId: null, canIssue: true }],
  });
  issue.mockResolvedValueOnce({ cardId: "new-card", name: "Employee", token: "c".repeat(48) });
  const cache = new QueryClient();
  const page = () => (
    <QueryClientProvider client={cache}>
      <CardsPage />
    </QueryClientProvider>
  );
  const view = render(page());
  fireEvent.click(await screen.findByRole("button", { name: t("cards.issue") }));
  await screen.findByRole("button", { name: t("cards.print") });
  scope.revalidating = true;
  view.rerender(page());
  expect(screen.queryByRole("button", { name: t("cards.print") })).not.toBeInTheDocument();
  scope.revalidating = false;
  view.rerender(page());
  expect(await screen.findByRole("button", { name: t("cards.print") })).toBeInTheDocument();
  expect(issue).toHaveBeenCalledTimes(1);
  expect(issue).toHaveBeenCalledWith({
    data: { companyId: "company", expectedUserId: "manager", staffId: "staff" },
  });
});
