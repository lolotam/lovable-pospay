import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CompanyCharts, CompanyChartSet } from "./company-charts";
import { MyAttendanceStrip } from "./my-attendance-strip";
import { t } from "@/i18n";
import type { AttendanceDay, SessionContextDto } from "../../contracts";
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
const data: AttendanceDay[] = Array.from({ length: 14 }, (_, i) => ({
  day: `2026-11-${String(i + 1).padStart(2, "0")}`,
  onTime: 2,
  late: 1,
  forgotten: 0,
  avgLate: 12,
}));
it("exposes fourteen daily numbers and their recorded values", () => {
  render(<CompanyChartSet data={{ attendance: data, lateLeaders: [], sessions: null }} />);
  const table = screen.getByRole("table", { name: t("charts.attendance") });
  expect(within(table).getAllByRole("row")).toHaveLength(15);
  expect(within(table).getAllByRole("row")[1]?.textContent).toBe("2026-11-01210");
});
it("empty periods show an empty state instead of axes", () => {
  render(<CompanyChartSet data={{ attendance: [], lateLeaders: [], sessions: null }} />);
  expect(screen.getAllByText(t("charts.empty"))).toHaveLength(3);
  expect(screen.queryByRole("table")).toBeNull();
});
it("missing reports.view never loads or displays company charts", () => {
  const context: SessionContextDto = {
    user: { id: "u", name: "U", email: "u@example.test" },
    active: {
      kind: "company",
      companyId: "90000000-0000-4000-8000-000000000001",
      companyName: "Salon",
      businessType: "salon",
      role: "owner",
      branchId: null,
      branchName: null,
    },
    permissions: [],
    workspaces: [],
  };
  render(<CompanyCharts context={context} range={14} onRange={() => {}} />);
  expect(screen.queryByText(t("charts.attendance"))).toBeNull();
});
it("personal strip includes thirty individually labelled days", () => {
  const strip = Array.from({ length: 30 }, (_, i) => ({
    ...data[0],
    day: `2026-11-${String(i + 1).padStart(2, "0")}`,
  })) as AttendanceDay[];
  render(<MyAttendanceStrip data={strip} />);
  expect(screen.getAllByLabelText(/2026-11-/)).toHaveLength(30);
});
