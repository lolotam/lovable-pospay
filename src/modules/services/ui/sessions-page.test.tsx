import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { expect, it, vi } from "vitest";
import { t } from "@/i18n";
import { SessionsPage } from "./sessions-page";

const { getSessionForm, record, requestApproval, getApprovalRequest } = vi.hoisted(() => ({
  getSessionForm: vi.fn(),
  record: vi.fn(),
  requestApproval: vi.fn(),
  getApprovalRequest: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  useServerFn: (handler: unknown) => handler,
  createServerFn: () => {
    const chain = { handler: () => chain, inputValidator: () => chain };
    return chain;
  },
}));
vi.mock("@/modules/staff", () => ({
  CompanyScope: ({ children }: { children: (id: string) => ReactNode }) => (
    <>{children("30000000-0000-4000-8000-000000000001")}</>
  ),
}));
vi.mock("../functions/session.functions", () => ({
  getSessionFormFn: getSessionForm,
  recordSessionFn: record,
  editSessionFn: vi.fn(),
}));
vi.mock("../functions/approval.functions", () => ({
  requestDiscountApprovalFn: requestApproval,
  getDiscountApprovalRequestFn: getApprovalRequest,
}));

const requestId = "40000000-0000-4000-8000-000000000001";
const approverId = "30000000-0000-4000-8000-000000000009";
const form = {
  canRecord: true,
  discountCap: 10,
  services: [
    {
      id: "30000000-0000-4000-8000-000000000002",
      name: "Haircut",
      priceMills: "100000",
      staffIds: ["30000000-0000-4000-8000-000000000003"],
    },
  ],
  staff: [{ id: "30000000-0000-4000-8000-000000000003", name: "Huda", timeZone: "Asia/Kuwait" }],
};
const laterIso = () => new Date(Date.now() + 240_000).toISOString();

function renderPage() {
  const cache = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  render(
    <QueryClientProvider client={cache}>
      <Suspense fallback="loading">
        <SessionsPage />
      </Suspense>
    </QueryClientProvider>,
  );
  return { cache };
}

async function fillForm() {
  fireEvent.change(await screen.findByLabelText(t("sessions.service")), {
    target: { value: form.services[0]!.id },
  });
  fireEvent.change(screen.getByLabelText(t("sessions.staff")), {
    target: { value: form.staff[0]!.id },
  });
  fireEvent.change(screen.getByLabelText(t("sessions.clientName")), {
    target: { value: "Noura" },
  });
  fireEvent.change(screen.getByLabelText(t("sessions.clientPhone")), {
    target: { value: "96550001111" },
  });
  fireEvent.change(screen.getByLabelText(t("sessions.at"), { exact: false }), {
    target: { value: "2027-03-10T14:30" },
  });
  fireEvent.change(screen.getByLabelText(t("sessions.price")), { target: { value: "85.000" } });
  fireEvent.change(screen.getByLabelText(t("sessions.reason")), { target: { value: "عرض العيد" } });
  fireEvent.click(screen.getByRole("button", { name: t("sessions.save") }));
}

/** يمرّ بتحذير التكرار ثم طلب الاعتماد ليفتح حوار الاعتماد؛ record يجب ضبطه قبلها. */
async function openApprovalDialog(
  approvers: { userId: string; name: string }[] = [],
  switchToRemote = true,
) {
  record.mockResolvedValueOnce({ status: "duplicate_warning" }).mockResolvedValueOnce({
    status: "pin_required",
    approvers,
  });
  const page = renderPage();
  await fillForm();
  fireEvent.click(await screen.findByRole("button", { name: t("sessions.duplicateConfirm") }));
  await screen.findByRole("tab", { name: t("sessions.remoteTab") });
  if (switchToRemote) {
    const remoteTab = screen.getByRole("tab", { name: t("sessions.remoteTab") });
    fireEvent.mouseDown(remoteTab);
    fireEvent.click(remoteTab);
  }
  return page;
}

it("re-sends the same idempotency key with confirmDuplicate after the duplicate warning", async () => {
  getSessionForm.mockReset().mockResolvedValue(form);
  record
    .mockReset()
    .mockResolvedValueOnce({ status: "duplicate_warning" })
    .mockResolvedValueOnce({ status: "saved", id: "r1", replayed: false });
  renderPage();
  await fillForm();
  expect(await screen.findByText(t("sessions.duplicateWarning"))).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: t("sessions.duplicateConfirm") }));
  await screen.findByText(t("sessions.saved"));
  expect(record).toHaveBeenCalledTimes(2);
  const [first, second] = record.mock.calls.map((call) => call[0].data);
  expect(first.requestId).toBe(second.requestId);
  expect(first.confirmDuplicate).toBeUndefined();
  expect(second.confirmDuplicate).toBe(true);
  expect(second.managerApproval).toBeUndefined();
});

it("shows the wrong-PIN message without any lock and saves on the retry", async () => {
  getSessionForm.mockReset().mockResolvedValue(form);
  record.mockReset();
  await openApprovalDialog([{ userId: approverId, name: "Mona" }], false);
  record
    .mockResolvedValueOnce({ status: "pin_invalid" })
    .mockResolvedValueOnce({ status: "saved", id: "r2", replayed: false });
  fireEvent.change(screen.getByLabelText(t("sessions.approver")), {
    target: { value: approverId },
  });
  const pinInput = screen.getByRole("textbox", { name: t("sessions.pinEnter") });
  fireEvent.change(pinInput, { target: { value: "9999" } });
  fireEvent.click(screen.getByRole("button", { name: t("sessions.pinSubmit") }));
  expect(await screen.findByText(t("sessions.pinInvalid"))).toBeInTheDocument();
  const retry = screen.getByRole("button", { name: t("sessions.pinSubmit") });
  expect(retry).toBeEnabled();
  fireEvent.change(pinInput, { target: { value: "1234" } });
  fireEvent.click(retry);
  await screen.findByText(t("sessions.saved"));
  const calls = record.mock.calls.map((call) => call[0].data);
  expect(calls.at(-2)!.managerApproval).toEqual({
    kind: "pin",
    approverUserId: approverId,
    pin: "9999",
  });
  expect(calls.at(-1)!.managerApproval).toEqual({
    kind: "pin",
    approverUserId: approverId,
    pin: "1234",
  });
  expect(calls.at(-1)!.confirmDuplicate).toBe(true);
  expect(calls.at(-1)!.requestId).toBe(calls[0]!.requestId);
});

it("keeps the remote tab available without PIN approvers and saves once approved", async () => {
  getSessionForm.mockReset().mockResolvedValue(form);
  record.mockReset();
  const { cache } = await openApprovalDialog();
  record.mockResolvedValueOnce({ status: "saved", id: "r3", replayed: false });
  requestApproval.mockReset().mockResolvedValue({ id: requestId });
  getApprovalRequest.mockReset().mockResolvedValue({
    status: "waiting",
    approverName: null,
    approverUserId: null,
    expiresAt: laterIso(),
  });
  fireEvent.click(screen.getByRole("button", { name: t("sessions.askRemote") }));
  expect(await screen.findByText(t("sessions.waiting"))).toBeInTheDocument();
  getApprovalRequest.mockResolvedValue({
    status: "approved",
    approverName: "Mona",
    approverUserId: approverId,
    expiresAt: laterIso(),
  });
  await act(async () => {
    await cache.invalidateQueries({ queryKey: ["discount-approval-request"] });
  });
  expect(
    await screen.findByText(t("sessions.approvedBy").replace("{name}", "Mona")),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: t("sessions.remoteSave") }));
  await screen.findByText(t("sessions.saved"));
  const saved = record.mock.calls.at(-1)![0].data;
  expect(saved.managerApproval).toEqual({ kind: "remote", approvalRequestId: requestId });
  expect(saved.confirmDuplicate).toBe(true);
  expect(saved.discountReason).toBe("عرض العيد");
});

it.each([
  ["rejected", t("sessions.rejected")],
  ["expired", t("sessions.expired")],
] as const)("shows %s from the poll without enabling the save", async (state, expected) => {
  getSessionForm.mockReset().mockResolvedValue(form);
  record.mockReset();
  await openApprovalDialog();
  requestApproval.mockReset().mockResolvedValue({ id: requestId });
  getApprovalRequest.mockReset().mockResolvedValue({
    status: state,
    approverName: null,
    approverUserId: null,
    expiresAt: laterIso(),
  });
  fireEvent.click(screen.getByRole("button", { name: t("sessions.askRemote") }));
  expect(await screen.findByText(expected)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: t("sessions.remoteSave") })).toBeDisabled();
});

it("keeps the price fields visible with a zero cap and surfaces the missing reason error", async () => {
  getSessionForm.mockReset().mockResolvedValue({ ...form, discountCap: 0 });
  record.mockReset().mockRejectedValue(new Error("DISCOUNT_REASON_REQUIRED"));
  renderPage();
  fireEvent.change(await screen.findByLabelText(t("sessions.service")), {
    target: { value: form.services[0]!.id },
  });
  const price = screen.getByLabelText(t("sessions.price"));
  expect(price).toBeVisible();
  fireEvent.change(price, { target: { value: "15.000" } });
  expect(screen.getByLabelText(t("sessions.reason"))).toBeRequired();
  fireEvent.change(screen.getByLabelText(t("sessions.clientName")), { target: { value: "Noura" } });
  fireEvent.change(screen.getByLabelText(t("sessions.clientPhone")), {
    target: { value: "96550001111" },
  });
  fireEvent.change(screen.getByLabelText(t("sessions.at"), { exact: false }), {
    target: { value: "2027-03-10T14:30" },
  });
  fireEvent.submit(screen.getByRole("button", { name: t("sessions.save") }).closest("form")!);
  expect(await screen.findByText(t("sessions.DISCOUNT_REASON_REQUIRED"))).toBeInTheDocument();
  expect(record).toHaveBeenCalledTimes(1);
});
