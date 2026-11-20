import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { t } from "@/i18n";
import { CloseMonthDialog } from "./close-month-dialog";
import { SessionHistoryDialog } from "./session-history-dialog";
import { ManageSessionsPage } from "./manage-sessions-page";

const {
  listEditable,
  listClosedMonths,
  monthCloseStatus,
  closeMonth,
  listSessionEdits,
  overrides,
} = vi.hoisted(() => ({
  listEditable: vi.fn(),
  listClosedMonths: vi.fn(),
  monthCloseStatus: vi.fn(),
  closeMonth: vi.fn(),
  listSessionEdits: vi.fn(),
  overrides: vi.fn(),
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
vi.mock("@/modules/commissions", () => ({ getServiceOverridesFn: overrides }));
vi.mock("../functions/session.functions", () => ({
  listEditableSessionsFn: listEditable,
  listClosedMonthsFn: listClosedMonths,
  getMonthCloseStatusFn: monthCloseStatus,
  closeMonthFn: closeMonth,
  listSessionEditsFn: listSessionEdits,
  editSessionFn: vi.fn(),
  getSessionFormFn: vi.fn(),
  recordSessionFn: vi.fn(),
}));

const companyId = "30000000-0000-4000-8000-000000000001";
const openSession = {
  id: "50000000-0000-4000-8000-000000000001",
  serviceId: "30000000-0000-4000-8000-000000000002",
  serviceName: "Haircut",
  staffId: "30000000-0000-4000-8000-000000000003",
  staffName: "Huda",
  branchId: "40000000-0000-4000-8000-000000000002",
  timeZone: "Asia/Kuwait",
  clientName: "Noura",
  clientPhoneLast3: "111",
  occurredAt: "2027-03-10T11:30:00.000Z",
  recordedAt: "2027-03-10T11:35:00.000Z",
  listPriceMills: "100000",
  priceMills: "85000",
  discountReason: "عرض",
  approvedBy: null,
  approverName: null,
  monthClosed: false,
  canEdit: true,
  editCount: 1,
};
const closedSession = {
  ...openSession,
  id: "50000000-0000-4000-8000-000000000002",
  monthClosed: true,
  canEdit: false,
  editCount: 0,
};

function renderManage(isOwner: boolean) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } })}
    >
      <ManageSessionsPage isOwner={isOwner} />
    </QueryClientProvider>,
  );
}

it("disables the edit of a closed-month session but keeps open months editable", async () => {
  listEditable.mockReset().mockResolvedValue([closedSession, openSession]);
  listClosedMonths.mockReset().mockResolvedValue([]);
  overrides
    .mockReset()
    .mockResolvedValue({ canManage: false, services: [], staff: [], overrides: [] });
  renderManage(false);
  expect((await screen.findAllByText("Noura")).length).toBeGreaterThan(0);
  const closedRow = screen.getByText(t("sessions.monthClosed")).closest("tr")!;
  expect(within(closedRow).queryByRole("button", { name: t("sessions.editButton") })).toBeNull();
  expect(screen.getAllByRole("button", { name: t("sessions.editButton") })).toHaveLength(1);
});

it("hides the close-month action for a non-owner", async () => {
  listEditable.mockReset().mockResolvedValue([]);
  listClosedMonths.mockReset().mockResolvedValue([]);
  renderManage(false);
  await screen.findByText(t("ops.empty"));
  expect(screen.queryByRole("button", { name: t("sessions.closeMonth") })).toBeNull();
});

it("shows the close-month action for the owner", async () => {
  listEditable.mockReset().mockResolvedValue([]);
  listClosedMonths.mockReset().mockResolvedValue([]);
  renderManage(true);
  expect(await screen.findByRole("button", { name: t("sessions.closeMonth") })).toBeInTheDocument();
});

it("closes an unfinished month only after typing the month and sends confirmUnfinishedMonth", async () => {
  listEditable.mockReset().mockResolvedValue([]);
  listClosedMonths.mockReset().mockResolvedValue([]);
  monthCloseStatus.mockReset().mockResolvedValue({ periodMonth: "2027-03-01", daysRemaining: 12 });
  closeMonth.mockReset().mockResolvedValue({ ok: true });
  renderManage(true);
  fireEvent.click(await screen.findByRole("button", { name: t("sessions.closeMonth") }));
  fireEvent.change(document.querySelector('input[type="month"]')!, {
    target: { value: "2027-03" },
  });
  expect(
    await screen.findByText(t("sessions.closeMonthDays").replace("{days}", "12")),
  ).toBeInTheDocument();
  const confirm = screen.getByRole("button", { name: t("sessions.closeConfirm") });
  expect(confirm).toBeDisabled();
  fireEvent.change(screen.getByLabelText(t("sessions.typeMonth")), {
    target: { value: "2027-03" },
  });
  await waitFor(() => expect(confirm).toBeEnabled());
  fireEvent.click(confirm);
  await screen.findByText(t("sessions.closeMonthDone"));
  expect(closeMonth).toHaveBeenCalledWith({
    data: { companyId, periodMonth: "2027-03-01", confirmUnfinishedMonth: true },
  });
});

it("shows the edit history with reason and before → after values", async () => {
  listSessionEdits.mockReset().mockResolvedValue([
    {
      id: "60000000-0000-4000-8000-000000000001",
      sessionId: openSession.id,
      editedBy: "manager",
      editorName: "Mona",
      editedAt: "2027-03-11T09:00:00.000Z",
      editReason: "اختيار خاطئ",
      before: {
        ...openSession,
        serviceName: "Haircut",
        staffId: "30000000-0000-4000-8000-000000000003",
        staffName: "Huda",
        clientName: "Noura",
        clientPhoneLast3: "111",
        priceMills: "95000",
      },
      after: { ...openSession },
    },
  ]);
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } })}
    >
      <SessionHistoryDialog
        companyId={companyId}
        timeZone="Asia/Kuwait"
        sessionId={openSession.id}
        onClose={() => {}}
      />
    </QueryClientProvider>,
  );
  expect(await screen.findByText("اختيار خاطئ")).toBeInTheDocument();
  expect(screen.getByText("Mona", { exact: false })).toBeInTheDocument();
  expect(screen.getAllByText("95.000").length).toBeGreaterThan(0);
  expect(screen.getAllByText("85.000").length).toBeGreaterThan(0);
});
