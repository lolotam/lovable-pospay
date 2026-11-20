import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { t } from "@/i18n";
import { SalariesPage } from "./salaries-page";

const { getSalaries, recordSalary } = vi.hoisted(() => ({
  getSalaries: vi.fn(),
  recordSalary: vi.fn(),
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
vi.mock("../functions/salaries.functions", () => ({
  getStaffSalariesFn: getSalaries,
  recordSalaryFn: recordSalary,
}));

const companyId = "30000000-0000-4000-8000-000000000001";
const staffId = "30000000-0000-4000-8000-000000000003";
const screenData = {
  staff: [
    {
      staffId,
      staffName: "Huda",
      branchId: "40000000-0000-4000-8000-000000000002",
      currentSalaryMills: "500000",
      currentEffectiveDate: "2027-02-15",
      history: [
        {
          id: "90000000-0000-4000-8000-000000000001",
          staffId,
          staffName: "Huda",
          branchId: "40000000-0000-4000-8000-000000000002",
          salaryMills: "450000",
          effectiveDate: "2027-01-01",
          recordedAt: "2027-01-01T08:00:00.000Z",
        },
        {
          id: "90000000-0000-4000-8000-000000000002",
          staffId,
          staffName: "Huda",
          branchId: "40000000-0000-4000-8000-000000000002",
          salaryMills: "500000",
          effectiveDate: "2027-02-15",
          recordedAt: "2027-02-15T08:00:00.000Z",
        },
      ],
    },
  ],
};

function renderPage() {
  getSalaries.mockReset().mockResolvedValue(screenData);
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } })}
    >
      <SalariesPage />
    </QueryClientProvider>,
  );
}

it("lists the current salary and the effective-dated history", async () => {
  renderPage();
  expect((await screen.findAllByText("500.000")).length).toBeGreaterThan(0);
  fireEvent.click(screen.getByText(t("salaries.history")));
  expect(screen.getByText("450.000")).toBeInTheDocument();
  expect(screen.getByText("2027-01-01")).toBeInTheDocument();
  expect(screen.getAllByText("2027-02-15").length).toBeGreaterThan(0);
});

it("records an effective-dated salary", async () => {
  recordSalary.mockReset().mockResolvedValue({ ok: true });
  renderPage();
  fireEvent.change(await screen.findByLabelText(t("salaries.staff")), {
    target: { value: staffId },
  });
  fireEvent.change(screen.getByLabelText(t("salaries.salaryKwd")), {
    target: { value: "525.000" },
  });
  fireEvent.change(screen.getByLabelText(t("salaries.effectiveDate")), {
    target: { value: "2027-03-01" },
  });
  fireEvent.click(screen.getByRole("button", { name: t("salaries.record") }));
  await screen.findByText(t("salaries.recorded"));
  expect(recordSalary).toHaveBeenCalledWith({
    data: { companyId, staffId, salaryKwd: "525.000", effectiveDate: "2027-03-01" },
  });
});

it("maps SALARY_MONTH_CLOSED to a clear message", async () => {
  recordSalary.mockReset().mockRejectedValue(new Error("SALARY_MONTH_CLOSED"));
  renderPage();
  fireEvent.change(await screen.findByLabelText(t("salaries.staff")), {
    target: { value: staffId },
  });
  fireEvent.change(screen.getByLabelText(t("salaries.salaryKwd")), {
    target: { value: "525.000" },
  });
  fireEvent.change(screen.getByLabelText(t("salaries.effectiveDate")), {
    target: { value: "2026-10-01" },
  });
  fireEvent.click(screen.getByRole("button", { name: t("salaries.record") }));
  expect(await screen.findByText(t("salaries.SALARY_MONTH_CLOSED"))).toBeInTheDocument();
});
