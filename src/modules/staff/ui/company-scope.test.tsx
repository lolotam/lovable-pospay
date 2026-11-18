import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { t } from "@/i18n";
import { duringAccountChange } from "@/lib/account-change";
import { ActiveCompanyProvider } from "@/lib/active-company";
import { CompanyScope } from "./company-scope";
import { preloadOperatorCompanies } from "./operator-companies-query";

const { useSession, verifyAuthSession, getMyCompanies, requireUserId } = vi.hoisted(() => ({
  useSession: vi.fn(),
  verifyAuthSession: vi.fn(),
  getMyCompanies: vi.fn(),
  requireUserId: vi.fn(),
}));
vi.mock("@/lib/auth-client", () => ({ authClient: { useSession }, verifyAuthSession }));
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
  getMyCompanies.mockImplementation(async ({ data }) =>
    data.expectedUserId === "second"
      ? secondResponse
      : [{ id: "first-company", name: "First company", role: "owner" }],
  );
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
  expect(await screen.findByRole("combobox")).toHaveValue("first-company");
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
  expect(screen.getByText("first-company")).not.toBeVisible();
  expect(screen.queryByRole("button", { name: "Export report" })).toBeNull();
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
  expect(screen.getByText("first-company")).not.toBeVisible();
  expect(screen.queryByRole("button", { name: "Export report" })).toBeNull();

  useSession.mockReturnValue({
    data: { user: { id: "first" } },
    isPending: false,
    error: new Error("Session check failed"),
  });
  view.rerender(screenForAccount());
  expect(screen.getByText("first-company")).not.toBeVisible();
  expect(screen.queryByRole("button", { name: "Export report" })).toBeNull();

  useSession.mockReturnValue({ data: { user: { id: "second" } }, isPending: false });
  view.rerender(screenForAccount());
  expect(screen.queryByText("first-company")).not.toBeInTheDocument();
  await act(async () => finishSecond(second));
  expect(await screen.findByRole("combobox")).toHaveValue("second-company");
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
  getMyCompanies.mockResolvedValue([first]);
  cache.setQueryData(key, { companies: [first], error: null });
  render(
    <QueryClientProvider client={cache}>
      <CompanyScope title="reports.title" switchLocked>
        {(companyId) => <p>{companyId}</p>}
      </CompanyScope>
    </QueryClientProvider>,
  );
  expect(await screen.findByRole("combobox")).toHaveValue(first.id);
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
  verifyAuthSession
    .mockRejectedValueOnce(new Error("Unavailable"))
    .mockResolvedValueOnce("manager");
  getMyCompanies.mockResolvedValue([{ id: "company", name: "Company", role: "owner" }]);
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
  expect(screen.getByText("Company data")).not.toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: t("auth.retrySession") }));
  expect(await screen.findByRole("button", { name: t("auth.retrySession") })).toBeVisible();
  expect(screen.getByText("Company data")).not.toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: t("auth.retrySession") }));
  expect(await screen.findByRole("combobox")).toBeVisible();
  expect(screen.getByText("Company data")).toBeVisible();
  expect(refetch).not.toHaveBeenCalled();
  expect(getMyCompanies).toHaveBeenLastCalledWith({ data: { expectedUserId: "manager" } });
});

it("keeps cached company details hidden while membership is being checked", async () => {
  const cache = new QueryClient();
  const userId = "revoked";
  useSession.mockReturnValue({ data: { user: { id: userId } }, isPending: false });
  cache.setQueryData(["operator-companies", userId], {
    companies: [{ id: "previous-company", name: "Previous company", role: "owner" }],
    error: null,
  });
  let finish!: (companies: []) => void;
  getMyCompanies.mockReturnValueOnce(
    new Promise<[]>((resolve) => {
      finish = resolve;
    }),
  );
  render(
    <QueryClientProvider client={cache}>
      <CompanyScope title="reports.title">{() => <p>Cached company details</p>}</CompanyScope>
    </QueryClientProvider>,
  );
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(screen.getByText("Cached company details")).not.toBeVisible();
  await act(async () => finish([]));
  expect(await screen.findByText(t("phone.noCompanies"))).toBeVisible();
  expect(screen.queryByText("Cached company details")).toBeNull();
});

it.each([
  ["active-company", "active-company"],
  [null, null],
])("inside an area, uses only the workspace company (%s)", async (pinned, shown) => {
  const cache = new QueryClient();
  const companies = [
    { id: "first-company", name: "First", role: "owner" },
    { id: "active-company", name: "Active", role: "owner" },
  ];
  useSession.mockReturnValue({ data: { user: { id: "owner" } }, isPending: false });
  getMyCompanies.mockResolvedValue(companies);
  cache.setQueryData(["operator-companies", "owner"], { companies, error: null });
  render(
    <QueryClientProvider client={cache}>
      <ActiveCompanyProvider value={pinned}>
        <CompanyScope title="reports.title">{(companyId) => <p>shown:{companyId}</p>}</CompanyScope>
      </ActiveCompanyProvider>
    </QueryClientProvider>,
  );
  const expected = shown ? `shown:${shown}` : t("phone.noCompanies");
  await waitFor(() => expect(screen.getByText(expected)).toBeVisible());
  expect(screen.queryByText("shown:first-company")).toBeNull();
  expect(screen.queryByRole("combobox")).toBeNull();
});
