import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CompanyScope } from "./company-scope";

const { useSession, getMyCompanies } = vi.hoisted(() => ({
  useSession: vi.fn(),
  getMyCompanies: vi.fn(),
}));
vi.mock("@/lib/auth-client", () => ({ authClient: { useSession } }));
vi.mock("@/lib/tenancy.functions", () => ({ getMyCompanies }));

it("uses the new account's companies when the query client survives an account switch", async () => {
  const cache = new QueryClient();
  useSession.mockReturnValue({ data: { user: { id: "first" } }, isPending: false });
  const second = [{ id: "second-company", name: "Second company", role: "staff" }];
  let finishSecond!: (companies: typeof second) => void;
  const secondResponse = new Promise<typeof second>((resolve) => {
    finishSecond = resolve;
  });
  getMyCompanies
    .mockResolvedValueOnce([{ id: "first-company", name: "First company", role: "owner" }])
    .mockReturnValueOnce(secondResponse);
  const screenForAccount = () => (
    <QueryClientProvider client={cache}>
      <CompanyScope title="reports.title">{(companyId) => <p>{companyId}</p>}</CompanyScope>
    </QueryClientProvider>
  );

  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(screenForAccount());
  });
  expect(screen.getByText("first-company")).toBeInTheDocument();
  useSession.mockReturnValue({ data: { user: { id: "second" } }, isPending: false });
  view.rerender(screenForAccount());
  expect(screen.queryByText("first-company")).not.toBeInTheDocument();
  await act(async () => finishSecond(second));
  expect(screen.getByText("second-company")).toBeInTheDocument();
  expect(getMyCompanies).toHaveBeenLastCalledWith({ data: { expectedUserId: "second" } });
});
