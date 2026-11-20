import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { t } from "@/i18n";
import { OverridesPage } from "./overrides-page";

const { getOverrides, saveOverride } = vi.hoisted(() => ({
  getOverrides: vi.fn(),
  saveOverride: vi.fn(),
}));
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
vi.mock("../functions/overrides.functions", () => ({
  getServiceOverridesFn: getOverrides,
  saveServiceOverrideFn: saveOverride,
}));

const companyId = "30000000-0000-4000-8000-000000000001";
const screenData = {
  canManage: true,
  services: [{ id: "30000000-0000-4000-8000-000000000002", name: "Haircut" }],
  staff: [
    {
      id: "30000000-0000-4000-8000-000000000003",
      name: "Huda",
      branchId: "40000000-0000-4000-8000-000000000002",
    },
  ],
  overrides: [
    {
      id: "80000000-0000-4000-8000-000000000001",
      serviceId: "30000000-0000-4000-8000-000000000002",
      serviceName: "Haircut",
      staffId: null,
      staffName: null,
      effectiveFrom: "2027-03-10T11:00:00.000Z",
      override: { kind: "rate_bp", rateBp: "1500" },
    },
    {
      id: "80000000-0000-4000-8000-000000000002",
      serviceId: "30000000-0000-4000-8000-000000000002",
      serviceName: "Haircut",
      staffId: "30000000-0000-4000-8000-000000000003",
      staffName: "Huda",
      effectiveFrom: "2027-03-11T09:30:00.000Z",
      override: { kind: "clear" },
    },
  ],
};

function renderPage() {
  getOverrides.mockReset().mockResolvedValue(screenData);
  saveOverride.mockReset().mockResolvedValue({ ok: true });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } })}
    >
      <OverridesPage />
    </QueryClientProvider>,
  );
}

it("saves a service-wide override with a null staff and no effective-date input", async () => {
  renderPage();
  fireEvent.change(await screen.findByLabelText(t("overrides.service")), {
    target: { value: screenData.services[0]!.id },
  });
  fireEvent.change(screen.getByLabelText(t("overrides.staff")), { target: { value: "" } });
  expect(screen.queryByLabelText(t("salaries.effectiveDate"))).toBeNull();
  expect(document.querySelector('input[type="date"]')).toBeNull();
  expect(document.querySelector('input[type="month"]')).toBeNull();
  fireEvent.change(screen.getByLabelText(t("commissions.ratePercent")), {
    target: { value: "15" },
  });
  fireEvent.click(screen.getByRole("button", { name: t("overrides.save") }));
  await screen.findByText(t("overrides.saved"));
  expect(saveOverride).toHaveBeenCalledWith({
    data: {
      companyId,
      serviceId: screenData.services[0]!.id,
      staffId: null,
      override: { kind: "rate_bp", ratePercent: "15" },
    },
  });
});

it("targets a staff member with a fixed amount and clears back to the plan", async () => {
  renderPage();
  await screen.findByLabelText(t("overrides.service"));
  fireEvent.change(screen.getByLabelText(t("overrides.service")), {
    target: { value: screenData.services[0]!.id },
  });
  fireEvent.change(screen.getByLabelText(t("overrides.staff")), {
    target: { value: screenData.staff[0]!.id },
  });
  fireEvent.change(screen.getByLabelText(t("overrides.kind")), {
    target: { value: "fixed_mills" },
  });
  fireEvent.change(screen.getByLabelText(t("commissions.amountKwd")), {
    target: { value: "5.000" },
  });
  fireEvent.click(screen.getByRole("button", { name: t("overrides.save") }));
  await screen.findByText(t("overrides.saved"));
  expect(saveOverride).toHaveBeenLastCalledWith({
    data: {
      companyId,
      serviceId: screenData.services[0]!.id,
      staffId: screenData.staff[0]!.id,
      override: { kind: "fixed_mills", kwd: "5.000" },
    },
  });
  fireEvent.change(screen.getByLabelText(t("overrides.kind")), { target: { value: "clear" } });
  expect(screen.queryByLabelText(t("commissions.amountKwd"))).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: t("overrides.save") }));
  await screen.findByText(t("overrides.saved"));
  expect(saveOverride).toHaveBeenLastCalledWith({
    data: {
      companyId,
      serviceId: screenData.services[0]!.id,
      staffId: screenData.staff[0]!.id,
      override: { kind: "clear" },
    },
  });
});

it("renders the history with the whole-service marker and each effective time", async () => {
  renderPage();
  expect((await screen.findAllByText(t("overrides.allStaff"))).length).toBeGreaterThan(0);
  expect(screen.getByText("15", { exact: false })).toBeInTheDocument();
  expect(screen.getAllByText(t("overrides.kind.clear")).length).toBeGreaterThan(0);
  expect(screen.getAllByText("Huda").length).toBeGreaterThan(0);
});
