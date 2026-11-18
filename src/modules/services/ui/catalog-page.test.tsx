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
  CompanyScope: ({ children }: { children: (id: string, userId: string) => ReactNode }) =>
    scope.unavailable ? null : children("30000000-0000-4000-8000-000000000001", "manager"),
}));
vi.mock("../functions/catalog.functions", () => ({
  getCatalogFn: getCatalog,
  saveServiceFn: save,
}));

it("preserves the exact account-bound create across a company scope refresh failure", async () => {
  getCatalog.mockResolvedValue({ canManage: true, services: [], staff: [] });
  save
    .mockRejectedValueOnce(new Error("Response lost"))
    .mockResolvedValueOnce({ status: "rejected" });
  const cache = new QueryClient();
  const page = () => (
    <QueryClientProvider client={cache}>
      <CatalogPage />
    </QueryClientProvider>
  );
  const view = render(page());
  fireEvent.click(await screen.findByRole("button", { name: t("services.add") }));
  fireEvent.change(screen.getByLabelText(t("services.name")), { target: { value: "New service" } });
  fireEvent.change(screen.getByLabelText(t("services.price")), { target: { value: "10" } });
  fireEvent.click(screen.getByRole("button", { name: t("services.save") }));
  await screen.findByText(t("services.createUnconfirmed"));

  scope.unavailable = true;
  view.rerender(page());
  scope.unavailable = false;
  view.rerender(page());
  const retry = await screen.findByRole("button", { name: t("services.retryCreate") });
  await waitFor(() => expect(retry).toBeEnabled());
  expect(screen.getByLabelText(t("services.name"))).toHaveValue("New service");
  fireEvent.click(retry);
  await screen.findByText(t("services.error"));
  expect(save).toHaveBeenCalledTimes(2);
  expect(save.mock.calls[1]).toEqual(save.mock.calls[0]);
  expect(save.mock.calls[0]?.[0].data.expectedUserId).toBe("manager");
});

it("retries only the catalog read after an uncertain create is confirmed", async () => {
  const empty = { canManage: true, services: [], staff: [] };
  getCatalog.mockReset().mockResolvedValue(empty);
  save
    .mockReset()
    .mockRejectedValueOnce(new Error("Response lost"))
    .mockImplementationOnce(async () => {
      getCatalog.mockRejectedValue(new Error("Catalog refresh failed"));
      return { status: "saved", id: "saved-service" };
    });
  const cache = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  render(
    <QueryClientProvider client={cache}>
      <CatalogPage />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: t("services.add") }));
  fireEvent.change(screen.getByLabelText(t("services.name")), { target: { value: "New service" } });
  fireEvent.change(screen.getByLabelText(t("services.price")), { target: { value: "10" } });
  fireEvent.click(screen.getByRole("button", { name: t("services.save") }));
  await screen.findByText(t("services.createUnconfirmed"));
  fireEvent.click(screen.getByRole("button", { name: t("services.retryCreate") }));
  const retryRead = await screen.findByRole("button", { name: t("ops.retryLoad") });
  getCatalog.mockResolvedValue({
    ...empty,
    services: [
      { id: "saved-service", name: "New service", priceMills: "10000", version: 1, staffIds: [] },
    ],
  });
  fireEvent.click(retryRead);
  expect(await screen.findByLabelText(t("services.name"))).toHaveValue("New service");
  expect(save).toHaveBeenCalledTimes(2);
});
