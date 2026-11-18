import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { t } from "@/i18n";
import { CatalogPage } from "./catalog-page";

const { getCatalog, save, scope } = vi.hoisted(() => ({
  getCatalog: vi.fn(),
  save: vi.fn(),
  scope: { unavailable: false },
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (handler: unknown) => handler }));
vi.mock("@/modules/staff", () => ({
  CompanyScope: ({
    children,
    switchLocked,
  }: {
    children: (id: string, userId: string) => ReactNode;
    switchLocked: boolean;
  }) =>
    scope.unavailable ? null : (
      <>
        <button type="button" disabled={switchLocked}>
          Switch company
        </button>
        {children("30000000-0000-4000-8000-000000000001", "manager")}
      </>
    ),
}));
vi.mock("../functions/catalog.functions", () => ({
  getCatalogFn: getCatalog,
  saveServiceFn: save,
}));

it.each(["read-only", "denied", "failed"] as const)(
  "preserves the exact create while allowing company switching when the catalog is %s",
  async (access) => {
    const catalog = { canManage: true, services: [], staff: [] };
    getCatalog.mockReset().mockResolvedValue(catalog);
    save
      .mockReset()
      .mockRejectedValueOnce(new Error("Response lost"))
      .mockResolvedValueOnce({ status: "rejected" });
    const cache = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
    const page = () => (
      <QueryClientProvider client={cache}>
        <CatalogPage />
      </QueryClientProvider>
    );
    const view = render(page());
    fireEvent.click(await screen.findByRole("button", { name: t("services.add") }));
    fireEvent.change(screen.getByLabelText(t("services.name")), {
      target: { value: "New service" },
    });
    fireEvent.change(screen.getByLabelText(t("services.price")), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: t("services.save") }));
    await screen.findByText(t("services.createUnconfirmed"));

    scope.unavailable = true;
    view.rerender(page());
    if (access === "failed") getCatalog.mockRejectedValue(new Error("Catalog unavailable"));
    else
      getCatalog.mockResolvedValue(access === "denied" ? null : { ...catalog, canManage: false });
    scope.unavailable = false;
    view.rerender(page());
    const status = {
      "read-only": "services.createManageAccessNeeded",
      denied: "ops.denied",
      failed: "ops.forbidden",
    } as const;
    expect(await screen.findByText(t(status[access]))).toBeVisible();
    expect(screen.getByRole("button", { name: "Switch company" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: t("services.retryCreate") })).toBeNull();
    getCatalog.mockResolvedValue(catalog);
    fireEvent.click(screen.getByRole("button", { name: t("ops.retryLoad") }));
    const retry = await screen.findByRole("button", { name: t("services.retryCreate") });
    await waitFor(() => expect(retry).toBeEnabled());
    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(t("services.name"))).toHaveValue("New service");
    fireEvent.click(retry);
    await screen.findByText(t("services.error"));
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]).toEqual(save.mock.calls[0]);
    expect(save.mock.calls[0]?.[0].data.expectedUserId).toBe("manager");
  },
);

it.each([true, false])(
  "retries a confirmed create read with manage access %s",
  async (canManage) => {
    const id = "30000000-0000-4000-8000-000000000004";
    const empty = { canManage: true, services: [], staff: [] };
    getCatalog.mockReset().mockResolvedValue(empty);
    save
      .mockReset()
      .mockRejectedValueOnce(new Error("Response lost"))
      .mockImplementationOnce(async () => {
        getCatalog.mockResolvedValue(null);
        return { status: "saved", id };
      })
      .mockResolvedValueOnce({ status: "saved", id });
    const cache = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
    render(
      <QueryClientProvider client={cache}>
        <CatalogPage />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: t("services.add") }));
    fireEvent.change(screen.getByLabelText(t("services.name")), {
      target: { value: "New service" },
    });
    fireEvent.change(screen.getByLabelText(t("services.price")), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: t("services.save") }));
    await screen.findByText(t("services.createUnconfirmed"));
    fireEvent.click(screen.getByRole("button", { name: t("services.retryCreate") }));
    const retryRead = await screen.findByRole("button", { name: t("ops.retryLoad") });
    expect(screen.getByText(t("ops.denied"))).toBeVisible();
    getCatalog.mockResolvedValue({
      ...empty,
      canManage,
      services: [{ id, name: "New service", priceMills: "10000", version: 1, staffIds: [] }],
    });
    fireEvent.click(retryRead);
    await screen.findByText("New service");
    expect(save).toHaveBeenCalledTimes(2);
    if (!canManage) {
      expect(screen.queryByLabelText(t("services.name"))).toBeNull();
      return;
    }
    const field = await screen.findByLabelText(t("services.name"));
    expect(field).toHaveValue("New service");
    fireEvent.change(field, { target: { value: "Renamed service" } });
    fireEvent.click(screen.getByRole("button", { name: t("services.save") }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(3));
    expect(save.mock.calls[2]?.[0].data).toMatchObject({ id, version: 1 });
    expect(save.mock.calls[2]?.[0].data).not.toHaveProperty("requestId");
  },
);
