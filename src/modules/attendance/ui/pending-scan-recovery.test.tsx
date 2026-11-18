import { fireEvent, render, screen } from "@testing-library/react";
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
  expect(sessionStorage.getItem("pospay:card-scan")).toBeNull();
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
