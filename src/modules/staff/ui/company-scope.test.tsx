import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { t } from "@/i18n";
import { duringAccountChange } from "@/lib/account-change";
import { CompanyScope } from "./company-scope";
import { preloadOperatorCompanies } from "./operator-companies-query";

const { useSession, getMyCompanies, requireUserId } = vi.hoisted(() => ({
  useSession: vi.fn(),
  getMyCompanies: vi.fn(),
  requireUserId: vi.fn(),
}));
vi.mock("@/lib/auth-client", () => ({ authClient: { useSession } }));
vi.mock("@/lib/tenancy.functions", () => ({ getMyCompanies }));
vi.mock("@/lib/server/session.server", () => ({ requireUserId }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ handler: (handler: unknown) => handler }),
}));

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
      <CompanyScope title="reports.title">
        {(companyId) => (
          <>
            <p>{companyId}</p>
            <button type="button">Export report</button>
          </>
        )}
      </CompanyScope>
    </QueryClientProvider>
  );

  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(screenForAccount());
  });
  expect(screen.getByText("first-company")).toBeVisible();
  let finishChange!: () => void;
  const changing = new Promise<void>((resolve) => {
    finishChange = resolve;
  });
  let transition!: Promise<void>;
  act(() => {
    transition = duringAccountChange(
      () => changing,
      async () => undefined,
    );
  });
  expect(screen.queryByText("first-company")).not.toBeInTheDocument();
  expect(screen.queryByText("Export report")).not.toBeInTheDocument();
  await act(async () => {
    finishChange();
    await transition;
  });

  useSession.mockReturnValue({
    data: { user: { id: "first" } },
    isPending: false,
    isRefetching: true,
  });
  view.rerender(screenForAccount());
  expect(screen.queryByText("first-company")).not.toBeInTheDocument();
  expect(screen.queryByText("Export report")).not.toBeInTheDocument();

  useSession.mockReturnValue({
    data: { user: { id: "first" } },
    isPending: false,
    error: new Error("Session check failed"),
  });
  view.rerender(screenForAccount());
  expect(screen.queryByText("first-company")).not.toBeInTheDocument();
  expect(screen.queryByText("Export report")).not.toBeInTheDocument();

  useSession.mockReturnValue({ data: { user: { id: "second" } }, isPending: false });
  view.rerender(screenForAccount());
  expect(screen.queryByText("first-company")).not.toBeInTheDocument();
  await act(async () => finishSecond(second));
  expect(screen.getByText("second-company")).toBeInTheDocument();
  expect(getMyCompanies).toHaveBeenLastCalledWith({ data: { expectedUserId: "second" } });
});

it("preloads only the authenticated account's scope", async () => {
  const cache = new QueryClient();
  const companies = [
    { id: "default-company", name: "Default", role: "owner" },
    { id: "other-company", name: "Other", role: "owner" },
  ];
  const preloadCompany = vi.fn().mockResolvedValue(undefined);
  requireUserId.mockResolvedValueOnce("loader-account");
  getMyCompanies.mockResolvedValueOnce(companies);
  await preloadOperatorCompanies(cache, preloadCompany);
  expect(cache.getQueryData(["operator-companies", "loader-account"])).toEqual({
    companies,
    error: null,
  });
  expect(cache.getQueryData(["operator-companies"])).toBeUndefined();
  expect(getMyCompanies).toHaveBeenLastCalledWith({ data: { expectedUserId: "loader-account" } });
  expect(preloadCompany).toHaveBeenCalledExactlyOnceWith("default-company", "loader-account");
  requireUserId.mockRejectedValueOnce(new Error("Session lookup failed"));
  await preloadOperatorCompanies(cache, preloadCompany);
  expect(preloadCompany).toHaveBeenCalledTimes(1);
});

it("keeps the default company selected when the refreshed list is reordered", async () => {
  const cache = new QueryClient();
  const first = { id: "original-company", name: "Original", role: "owner" };
  const added = { id: "added-company", name: "Added", role: "owner" };
  const key = ["operator-companies", "manager"];
  useSession.mockReturnValue({ data: { user: { id: "manager" } }, isPending: false });
  cache.setQueryData(key, { companies: [first], error: null });
  render(
    <QueryClientProvider client={cache}>
      <CompanyScope title="reports.title" switchLocked>
        {(companyId) => <p>{companyId}</p>}
      </CompanyScope>
    </QueryClientProvider>,
  );
  expect(screen.getByText(first.id)).toBeInTheDocument();
  act(() => {
    cache.setQueryData(key, { companies: [added, first], error: null });
  });
  expect(await screen.findByText(added.name)).toBeInTheDocument();
  expect(screen.getByText(first.id)).toBeInTheDocument();
  expect(screen.queryByText(added.id)).not.toBeInTheDocument();
});

it("offers session re-verification after an unexpected network failure", async () => {
  const cache = new QueryClient();
  const refetch = vi.fn().mockResolvedValue(undefined);
  const session = { data: { user: { id: "manager" } }, isPending: false, refetch };
  useSession.mockReturnValue(session);
  cache.setQueryData(["operator-companies", "manager"], {
    companies: [{ id: "company", name: "Company", role: "owner" }],
    error: null,
  });
  render(
    <QueryClientProvider client={cache}>
      <CompanyScope title="reports.title">{() => <p>Company data</p>}</CompanyScope>
    </QueryClientProvider>,
  );
  await act(async () =>
    duringAccountChange(
      async () => undefined,
      async () => {
        throw new Error("Offline");
      },
    ),
  );
  expect(screen.queryByText("Company data")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: t("auth.retrySession") }));
  expect(await screen.findByText("Company data")).toBeInTheDocument();
  expect(refetch).toHaveBeenCalledWith({ query: { disableCookieCache: true } });
});
