import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { t } from "@/i18n";
import { PlansPage } from "./plans-page";
import { buildPlanRulesInput, emptyBuilderState, type BuilderState } from "./builder-state";

const { getPlans, createPlan, addVersion, assign } = vi.hoisted(() => ({
  getPlans: vi.fn(),
  createPlan: vi.fn(),
  addVersion: vi.fn(),
  assign: vi.fn(),
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
vi.mock("../functions/plans.functions", () => ({
  getCommissionPlansFn: getPlans,
  createPlanWithVersionFn: createPlan,
  addPlanVersionFn: addVersion,
  assignPlanFn: assign,
}));

const staff = [
  {
    staffId: "30000000-0000-4000-8000-000000000003",
    staffName: "Huda",
    branchId: "40000000-0000-4000-8000-000000000002",
    planId: null,
    planName: null,
    effectiveMonth: null,
  },
];
const plansScreen = { plans: [], staff };

describe("buildPlanRulesInput", () => {
  it("builds the base percent and base fixed blocks", () => {
    const state: BuilderState = {
      ...emptyBuilderState,
      baseRateEnabled: true,
      baseRatePercent: "2.5",
      baseFixedEnabled: true,
      baseFixedKwd: "2.000",
    };
    expect(buildPlanRulesInput(state)).toEqual({
      baseRatePercent: "2.5",
      baseFixedKwd: "2.000",
    });
  });
  it("builds sales-amount tiers with fixed thresholds", () => {
    const state: BuilderState = {
      ...emptyBuilderState,
      tiersEnabled: true,
      mode: "excess",
      thresholdKind: "fixed",
      salesTiers: [
        { ratePercent: "5", threshold: "1000.000" },
        { ratePercent: "8", threshold: "2000.000" },
      ],
    };
    expect(buildPlanRulesInput(state)).toEqual({
      tierSchedule: {
        accumulator: "sales_amount",
        mode: "excess",
        thresholdKind: "fixed",
        tiers: [
          { ratePercent: "5", threshold: { kind: "fixed", kwd: "1000.000" } },
          { ratePercent: "8", threshold: { kind: "fixed", kwd: "2000.000" } },
        ],
      },
    });
  });
  it("builds session-count tiers with a fixed reward", () => {
    const state: BuilderState = {
      ...emptyBuilderState,
      tiersEnabled: true,
      accumulator: "session_count",
      sessionTiers: [{ afterSessions: "20", rewardKind: "fixed_mills", rewardValue: "2.500" }],
    };
    expect(buildPlanRulesInput(state)).toEqual({
      tierSchedule: {
        accumulator: "session_count",
        mode: "excess",
        tiers: [{ afterSessions: 20, reward: { kind: "fixed_mills", kwd: "2.500" } }],
      },
    });
  });
  it("builds salary-multiple thresholds for the all-after mode", () => {
    const state: BuilderState = {
      ...emptyBuilderState,
      tiersEnabled: true,
      mode: "all_after",
      thresholdKind: "salary_multiple",
      salesTiers: [{ ratePercent: "10", threshold: "2" }],
    };
    expect(buildPlanRulesInput(state)).toEqual({
      tierSchedule: {
        accumulator: "sales_amount",
        mode: "all_after",
        thresholdKind: "salary_multiple",
        tiers: [{ ratePercent: "10", threshold: { kind: "salary_multiple", multiple: "2" } }],
      },
    });
  });
});

function renderPage() {
  getPlans.mockReset().mockResolvedValue(plansScreen);
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } })}
    >
      <PlansPage />
    </QueryClientProvider>,
  );
}

async function enableTiers(accumulator: "sales_amount" | "session_count") {
  await screen.findByText(t("commissions.builderTitle"));
  const tiersToggle = screen.getByRole("checkbox", { name: t("commissions.methodTiers") });
  fireEvent.click(tiersToggle);
  fireEvent.change(screen.getByLabelText(t("commissions.accumulator")), {
    target: { value: accumulator },
  });
  if (accumulator === "sales_amount") {
    fireEvent.change(screen.getByLabelText(t("commissions.mode")), {
      target: { value: "excess" },
    });
    fireEvent.change(screen.getByLabelText(t("commissions.thresholdKind")), {
      target: { value: "fixed" },
    });
  }
}

it("previews the exact progressive-bracket breakdown for a known case", async () => {
  renderPage();
  await enableTiers("sales_amount");
  fireEvent.change(screen.getByLabelText(t("commissions.previewSessions")), {
    target: { value: "10" },
  });
  fireEvent.change(screen.getByLabelText(t("commissions.previewSessionNet")), {
    target: { value: "300.000" },
  });
  const rows = screen.getAllByLabelText(t("commissions.ratePercent"));
  fireEvent.change(rows[0]!, { target: { value: "5" } });
  fireEvent.change(screen.getAllByLabelText(t("commissions.amountKwd"))[0]!, {
    target: { value: "1000.000" },
  });
  fireEvent.click(screen.getByRole("button", { name: t("commissions.addTier") }));
  fireEvent.change(screen.getAllByLabelText(t("commissions.ratePercent"))[1]!, {
    target: { value: "8" },
  });
  fireEvent.change(screen.getAllByLabelText(t("commissions.amountKwd"))[1]!, {
    target: { value: "2000.000" },
  });
  expect((await screen.findAllByText("130.000")).length).toBeGreaterThan(0);
  expect(screen.getByText("3000.000")).toBeInTheDocument();
});

it("limits the tier rows between one and twenty and flags staff without a plan", async () => {
  renderPage();
  await enableTiers("session_count");
  const add = screen.getByRole("button", { name: t("commissions.addTier") });
  const remove = screen.getAllByRole("button", { name: t("commissions.removeTier") })[0]!;
  expect(remove).toBeDisabled();
  for (let index = 1; index < 20; index += 1) fireEvent.click(add);
  expect(add).toBeDisabled();
  expect(screen.getAllByLabelText(t("commissions.afterSessions"))).toHaveLength(20);
  expect(await screen.findByText(t("commissions.noPlan"))).toBeInTheDocument();
});

it("sends the built rules on create and flags an empty plan", async () => {
  createPlan.mockReset().mockRejectedValueOnce(new Error("PLAN_EMPTY"));
  createPlan.mockResolvedValueOnce({ planId: "p1", versionId: "v1" });
  renderPage();
  await screen.findByText(t("commissions.builderTitle"));
  fireEvent.change(await screen.findByLabelText(t("commissions.planName")), {
    target: { value: "Nails" },
  });
  fireEvent.change(screen.getAllByLabelText(t("commissions.effectiveMonth"))[0]!, {
    target: { value: "2027-04" },
  });
  fireEvent.click(screen.getByRole("button", { name: t("commissions.create") }));
  expect(await screen.findByText(t("commissions.PLAN_EMPTY"))).toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox", { name: t("commissions.methodBaseFixed") }));
  fireEvent.change(screen.getByLabelText(t("commissions.amountKwd")), {
    target: { value: "2.000" },
  });
  fireEvent.click(screen.getAllByRole("button", { name: t("commissions.create") })[0]!);
  await screen.findByText(t("ops.saved"));
  expect(createPlan).toHaveBeenLastCalledWith({
    data: {
      companyId: "30000000-0000-4000-8000-000000000001",
      name: "Nails",
      effectiveMonth: "2027-04-01",
      rules: { baseFixedKwd: "2.000" },
    },
  });
});
