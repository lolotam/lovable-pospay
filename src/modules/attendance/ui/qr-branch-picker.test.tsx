import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { QrBranchPicker } from "./qr-branch-picker";

const { listQrBranchesFn } = vi.hoisted(() => ({ listQrBranchesFn: vi.fn() }));
vi.mock("../functions/attendance.functions", () => ({ listQrBranchesFn }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, search }: { children: React.ReactNode; search: { branch: string } }) => (
    <a href={`/pos/qr?branch=${search.branch}`}>{children}</a>
  ),
}));
vi.mock("./reception-qr", () => ({
  ReceptionQr: ({ branchId }: { branchId: string }) => <p>qr:{branchId}</p>,
}));

const view = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <QrBranchPicker companyId="40000000-0000-4000-8000-000000000001" />
    </QueryClientProvider>,
  );

it("offers each branch of the active company as a QR link", async () => {
  listQrBranchesFn.mockResolvedValue([
    { id: "b1", name: "North" },
    { id: "b2", name: "South" },
  ]);
  view();
  expect(await screen.findByRole("link", { name: "North" })).toHaveAttribute(
    "href",
    "/pos/qr?branch=b1",
  );
  expect(screen.getByRole("link", { name: "South" })).toHaveAttribute("href", "/pos/qr?branch=b2");
  expect(listQrBranchesFn).toHaveBeenCalledWith({
    data: { companyId: "40000000-0000-4000-8000-000000000001" },
  });
});

it("shows the QR directly when the company has one branch", async () => {
  listQrBranchesFn.mockResolvedValue([{ id: "b1", name: "North" }]);
  view();
  expect(await screen.findByText("qr:b1")).toBeInTheDocument();
});
