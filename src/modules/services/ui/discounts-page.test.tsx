import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { t } from "@/i18n";
import { DiscountsPage } from "./discounts-page";

const { getSettings, saveGrant, revokeGrant, setPin, pinStatus, failedAttempts } = vi.hoisted(
  () => ({
    getSettings: vi.fn(),
    saveGrant: vi.fn(),
    revokeGrant: vi.fn(),
    setPin: vi.fn(),
    pinStatus: vi.fn(),
    failedAttempts: vi.fn(),
  }),
);
vi.mock("@tanstack/react-start", () => ({
  useServerFn: (handler: unknown) => handler,
  createServerFn: () => {
    const chain = { handler: () => chain, inputValidator: () => chain };
    return chain;
  },
}));
vi.mock("@/modules/staff", () => ({
  CompanyScope: ({ children }: { children: (id: string, userId: string) => React.ReactNode }) => (
    <>{children("30000000-0000-4000-8000-000000000001", "manager")}</>
  ),
}));
vi.mock("../functions/discount.functions", () => ({
  getDiscountSettingsFn: getSettings,
  saveDiscountGrantFn: saveGrant,
  revokeDiscountGrantFn: revokeGrant,
  setManagerPinFn: setPin,
  getManagerPinStatusFn: pinStatus,
  listFailedPinAttemptsFn: failedAttempts,
}));

const settings = {
  canManage: true,
  grants: [],
  members: [{ userId: "member-1", name: "Mona" }],
};

function renderPage() {
  getSettings.mockReset().mockResolvedValue(settings);
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } })}
    >
      <DiscountsPage />
    </QueryClientProvider>,
  );
}

it("shows the PIN status badge and never echoes the saved PIN", async () => {
  pinStatus.mockReset().mockResolvedValue({ hasPin: false });
  failedAttempts.mockReset().mockResolvedValue([]);
  setPin.mockReset().mockResolvedValue({ ok: true });
  renderPage();
  await screen.findByText(t("pin.status.missing"));
  const pinInput = screen.getByRole("textbox", { name: t("sessions.pinEnter") });
  fireEvent.change(pinInput, { target: { value: "4321" } });
  fireEvent.click(screen.getByRole("button", { name: t("pin.save") }));
  await screen.findByText(t("pin.saved"));
  expect(setPin).toHaveBeenCalledWith({
    data: { companyId: "30000000-0000-4000-8000-000000000001", pin: "4321" },
  });
  expect(screen.queryByText("4321")).toBeNull();
  expect(pinInput).toHaveValue("");
});

it("lists failed PIN attempts with translated fallbacks for missing names", async () => {
  pinStatus.mockReset().mockResolvedValue({ hasPin: true });
  failedAttempts.mockReset().mockResolvedValue([
    {
      id: "70000000-0000-4000-8000-000000000001",
      branchId: "40000000-0000-4000-8000-000000000002",
      sessionId: "50000000-0000-4000-8000-000000000001",
      approverUserId: "approver-1",
      approverName: null,
      requestedBy: "reception-1",
      requesterName: "Reem",
      userAgent: "Mozilla/5.0 reception-tablet",
      attemptedAt: "2027-03-10T11:00:00.000Z",
    },
  ]);
  renderPage();
  await screen.findByText(t("pin.attempts"));
  expect(screen.getByText(t("ops.genericManager"), { exact: false })).toBeInTheDocument();
  expect(screen.getByText("Reem", { exact: false })).toBeInTheDocument();
  expect(screen.getByText("Mozilla/5.0 reception-tablet", { exact: false })).toBeInTheDocument();
  expect(screen.queryByText("approver-1")).toBeNull();
});
