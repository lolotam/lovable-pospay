import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { Suspense } from "react";
import { expect, it, vi } from "vitest";
import { ActiveCompanyProvider } from "@/lib/active-company";
import { PhonePage } from "./phone-page";

const { getMyCompanies, getPhoneManagementFn } = vi.hoisted(() => ({
  getMyCompanies: vi.fn(),
  getPhoneManagementFn: vi.fn(),
}));
vi.mock("@/lib/tenancy.functions", () => ({ getMyCompanies }));
vi.mock("@/modules/staff", () => ({
  getPhoneManagementFn,
  startBindingFn: vi.fn(),
  finishBindingFn: vi.fn(),
  unbindPhoneFn: vi.fn(),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "owner" } } }) },
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@simplewebauthn/browser", () => ({ startAuthentication: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ Link: () => null }));

it("manages phones only for the active workspace company", async () => {
  getMyCompanies.mockResolvedValue([
    { id: "first-company", name: "First", role: "owner" },
    { id: "active-company", name: "Active", role: "owner" },
  ]);
  getPhoneManagementFn.mockResolvedValue({
    canBind: false,
    isBound: false,
    browserBinding: null,
    canManage: true,
    staff: [],
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ActiveCompanyProvider value="active-company">
        <Suspense fallback={null}>
          <PhonePage mode="management" />
        </Suspense>
      </ActiveCompanyProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(getPhoneManagementFn).toHaveBeenCalled());
  expect(getPhoneManagementFn).toHaveBeenCalledWith(
    expect.objectContaining({ data: { companyId: "active-company" } }),
  );
  expect(getPhoneManagementFn).not.toHaveBeenCalledWith(
    expect.objectContaining({ data: { companyId: "first-company" } }),
  );
  expect(screen.queryByRole("combobox")).toBeNull();
});
