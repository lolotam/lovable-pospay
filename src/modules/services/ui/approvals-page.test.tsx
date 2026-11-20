import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { t } from "@/i18n";
import { ApprovalsPage } from "./approvals-page";

const { decide, listPending } = vi.hoisted(() => ({ decide: vi.fn(), listPending: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  useServerFn: (handler: unknown) => handler,
  createServerFn: () => {
    const chain = { handler: () => chain, inputValidator: () => chain };
    return chain;
  },
}));
vi.mock("@/modules/staff", () => ({
  CompanyScope: ({ children }: { children: (id: string) => React.ReactNode }) => (
    <>{children("30000000-0000-4000-8000-000000000001")}</>
  ),
}));
vi.mock("../functions/approval.functions", () => ({
  decideDiscountApprovalFn: decide,
  listPendingDiscountApprovalsFn: listPending,
}));

const pending = [
  {
    id: "40000000-0000-4000-8000-000000000001",
    branchId: "40000000-0000-4000-8000-000000000002",
    branchName: "Salmiya",
    serviceName: "Haircut",
    listPriceMills: "100000",
    requestedPriceMills: "85000",
    discountReason: "عرض العيد",
    requesterName: "Reem",
    createdAt: new Date(Date.now() - 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 240_000).toISOString(),
  },
];

function renderPage() {
  listPending.mockReset().mockResolvedValue(pending);
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } })}
    >
      <ApprovalsPage />
    </QueryClientProvider>,
  );
}

it("lists pending requests without any client phone and labels both prices", async () => {
  decide.mockReset().mockResolvedValue({ ok: true });
  renderPage();
  expect(await screen.findByText("Salmiya")).toBeInTheDocument();
  expect(screen.getByText("Reem")).toBeInTheDocument();
  expect(screen.getByText("عرض العيد")).toBeInTheDocument();
  expect(screen.getByText(t("approvals.listPrice"))).toBeInTheDocument();
  expect(screen.getByText(t("approvals.requestedPrice"))).toBeInTheDocument();
  expect(screen.queryByText("96550001111")).not.toBeInTheDocument();
  expect(screen.queryByText("•••111")).not.toBeInTheDocument();
  expect(screen.getByText(t("approvals.minutes").replace("{n}", "4"))).toBeInTheDocument();
});

it("calls decideDiscountApprovalFn with approve and rejects", async () => {
  decide.mockReset().mockResolvedValue({ ok: true });
  renderPage();
  const approve = await screen.findByRole("button", { name: t("approvals.approve") });
  fireEvent.click(approve);
  await screen.findByText(t("approvals.done"));
  expect(decide).toHaveBeenCalledWith({
    data: {
      companyId: "30000000-0000-4000-8000-000000000001",
      requestId: pending[0]!.id,
      approve: true,
    },
  });
  fireEvent.click(screen.getByRole("button", { name: t("approvals.reject") }));
  await screen.findByText(t("approvals.done"));
  expect(decide).toHaveBeenLastCalledWith({
    data: {
      companyId: "30000000-0000-4000-8000-000000000001",
      requestId: pending[0]!.id,
      approve: false,
    },
  });
});
