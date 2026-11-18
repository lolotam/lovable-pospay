import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { t } from "@/i18n";
import { ReportsPage } from "./reports-page";

const { getReport } = vi.hoisted(() => ({ getReport: vi.fn() }));
vi.mock("@/modules/staff", () => ({
  CompanyScope: ({ children }: { children: (id: string, userId: string) => ReactNode }) =>
    children("company", "report-user"),
}));
vi.mock("../functions/report.functions", () => ({ getOperationalReportFn: getReport }));

it("retries a failed report with the original account, company, range and tab", async () => {
  getReport.mockRejectedValueOnce(new Error("Offline")).mockRejectedValueOnce(new Error("Offline"));
  getReport.mockResolvedValueOnce({ attendance: [], sessions: [] });
  const cache = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  render(
    <QueryClientProvider client={cache}>
      <ReportsPage />
    </QueryClientProvider>,
  );

  fireEvent.change(screen.getByLabelText(t("reports.from")), {
    target: { value: "2026-11-01T09:00" },
  });
  fireEvent.change(screen.getByLabelText(t("reports.until")), {
    target: { value: "2026-11-02T09:00" },
  });
  fireEvent.click(screen.getByRole("button", { name: t("reports.show") }));

  const retry = await screen.findByRole("button", { name: t("reports.retry") });
  expect(screen.getByRole("alert")).toHaveTextContent(t("reports.loadFailed"));
  expect(getReport).toHaveBeenCalledTimes(2);
  fireEvent.click(retry);
  expect(await screen.findByRole("button", { name: t("export.csv") })).toBeInTheDocument();
  expect(getReport).toHaveBeenCalledTimes(3);
  const [first, second, manual] = getReport.mock.calls;
  expect(first?.[0].data).toMatchObject({
    companyId: "company",
    expectedUserId: "report-user",
    tab: "attendance",
  });
  expect(second).toEqual(first);
  expect(manual).toEqual(first);
});
