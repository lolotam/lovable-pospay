import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { WorkspaceDto } from "@/modules/permissions";
import { PendingScanRecovery } from "./pending-scan-recovery";

const { settleCardScanFn } = vi.hoisted(() => ({ settleCardScanFn: vi.fn() }));
vi.mock("../functions/card.functions", () => ({ settleCardScanFn, scanCardFn: vi.fn() }));
vi.mock("@/modules/staff", () => ({ CompanyScope: () => null }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));

const companyId = "30000000-0000-4000-8000-000000000001";
const workspace: WorkspaceDto = {
  kind: "company",
  companyId,
  companyName: "Salon",
  businessType: "salon",
  role: "reception",
  branchId: null,
  branchName: null,
};
const attempt = {
  companyId,
  expectedUserId: "reception",
  requestId: "30000000-0000-4000-8000-000000000002",
  requestedAt: 1_800_000_000_000,
};
const store = (value: object) => sessionStorage.setItem("pospay:card-scan", JSON.stringify(value));
afterEach(() => sessionStorage.clear());

it("recovers the committed result of a pending scan and forgets the attempt", async () => {
  store(attempt);
  settleCardScanFn.mockResolvedValueOnce({
    status: "recorded",
    scan: { name: "Mona", result: { outcome: "checked_in" } },
  });
  render(<PendingScanRecovery workspace={workspace} userId="reception" />);
  fireEvent.click(await screen.findByRole("button"));
  expect(await screen.findByText(/^Mona · /)).toBeInTheDocument();
  expect(settleCardScanFn).toHaveBeenCalledWith({ data: attempt });
  // الحذف يتم في effect بعد عرض النتيجة، فننتظره بدل افتراض توقيت التنفيذ.
  await waitFor(() => expect(sessionStorage.getItem("pospay:card-scan")).toBeNull());
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it.each([
  ["another operator", { ...attempt, expectedUserId: "someone-else" }],
  ["another company", { ...attempt, companyId: "30000000-0000-4000-8000-000000000009" }],
])("offers nothing for an attempt from %s", (_label, other) => {
  store(other);
  const { container } = render(<PendingScanRecovery workspace={workspace} userId="reception" />);
  expect(container).toBeEmptyDOMElement();
  expect(sessionStorage.getItem("pospay:card-scan")).not.toBeNull();
});

it("keeps the attempt when the view closes before the result arrives", async () => {
  store(attempt);
  let answer!: (response: unknown) => void;
  settleCardScanFn.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
  const { unmount } = render(<PendingScanRecovery workspace={workspace} userId="reception" />);
  fireEvent.click(await screen.findByRole("button"));
  unmount();
  await act(async () =>
    answer({ status: "recorded", scan: { name: "Mona", result: { outcome: "checked_in" } } }),
  );
  expect(sessionStorage.getItem("pospay:card-scan")).not.toBeNull();
});

it("does not carry a result into another workspace", async () => {
  store(attempt);
  settleCardScanFn.mockResolvedValueOnce({ status: "rejected" });
  const { rerender } = render(<PendingScanRecovery workspace={workspace} userId="reception" />);
  fireEvent.click(await screen.findByRole("button"));
  expect(await screen.findByRole("status")).not.toBeEmptyDOMElement();
  rerender(
    <PendingScanRecovery
      workspace={{ ...workspace, companyId: "30000000-0000-4000-8000-000000000009" }}
      userId="reception"
    />,
  );
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
