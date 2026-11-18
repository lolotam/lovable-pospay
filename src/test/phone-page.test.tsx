import { Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { t } from "@/i18n";
import { PhoneBinding } from "@/modules/staff/ui/phone-binding";

const { getManagement, begin, finish, addPasskey, getCompanies, authenticate } = vi.hoisted(() => ({
  getManagement: vi.fn(),
  begin: vi.fn(),
  finish: vi.fn(),
  addPasskey: vi.fn(),
  getCompanies: vi.fn(),
  authenticate: vi.fn(),
}));

vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  Link: ({ children }: { children: string }) => <a href="/">{children}</a>,
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (handler: unknown) => handler }));
vi.mock("@simplewebauthn/browser", () => ({ startAuthentication: authenticate }));
vi.mock("@/lib/auth-client", () => ({ authClient: { passkey: { addPasskey } } }));
vi.mock("@/lib/tenancy.functions", () => ({ getMyCompanies: getCompanies }));
vi.mock("@/modules/staff", () => ({
  getPhoneManagementFn: getManagement,
  startBindingFn: begin,
  finishBindingFn: finish,
  unbindPhoneFn: vi.fn(),
}));

const scrollIntoView = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
beforeAll(() => {
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});
afterAll(() => {
  if (scrollIntoView) Object.defineProperty(Element.prototype, "scrollIntoView", scrollIntoView);
  else Reflect.deleteProperty(Element.prototype, "scrollIntoView");
});

function showPhonePage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Suspense fallback={<p>Loading phone page</p>}>
        <PhoneBinding />
      </Suspense>
    </QueryClientProvider>,
  );
}

async function selectCompany(name: string) {
  fireEvent.keyDown(screen.getByRole("combobox", { name: t("phone.companyName") }), {
    key: "Enter",
  });
  const option = await screen.findByRole("option", { name });
  fireEvent.keyDown(option, { key: "Enter" });
}

it("offers two companies before binding and shows the linked company after binding and reopening", async () => {
  const companies = [
    { id: "a", name: "Salon A" },
    { id: "b", name: "Salon B" },
  ];
  let linked: { companyId: string; companyName: string } | null = null;
  getCompanies.mockResolvedValue(companies);
  getManagement.mockImplementation(async ({ data }: { data: { companyId: string } }) => ({
    canBind: !linked,
    isBound: linked?.companyId === data.companyId,
    browserBinding: linked,
    canManage: false,
    staff: [],
  }));
  begin.mockResolvedValue({ options: {}, challengeId: "challenge" });
  addPasskey.mockResolvedValue({});
  authenticate.mockResolvedValue({ id: "owned-passkey" });
  let complete: () => void = () => {};
  const waitForBind = new Promise<void>((resolve) => {
    complete = resolve;
  });
  finish.mockImplementation(async ({ data }: { data: { companyId: string } }) => {
    const company = companies.find(({ id }) => id === data.companyId);
    if (!company) throw new Error("Unknown test company");
    await waitForBind;
    linked = { companyId: company.id, companyName: company.name };
  });
  const bindName = t("phone.bind");
  const linkedMessage = t("phone.boundCompany").replace("{company}", "Salon B");
  const page = showPhonePage();
  await waitFor(() => expect(screen.getByRole("button", { name: bindName })).toBeEnabled());
  await selectCompany("Salon B");
  await waitFor(() => expect(screen.getByRole("button", { name: bindName })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: bindName }));

  await waitFor(() => expect(finish).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("combobox", { name: t("phone.companyName") })).toBeDisabled();
  complete();

  expect(await screen.findByText(linkedMessage)).toBeInTheDocument();
  expect(finish).toHaveBeenCalledWith({ data: expect.objectContaining({ companyId: "b" }) });
  expect(screen.getByText(t("phone.oneCompanyPerBrowser"))).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: bindName })).toBeNull();

  await selectCompany("Salon A");
  expect(await screen.findByText(linkedMessage)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: bindName })).toBeNull();

  page.unmount();
  showPhonePage();
  expect(await screen.findByText(linkedMessage)).toBeInTheDocument();
  expect(screen.getByText(t("phone.oneCompanyPerBrowser"))).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: bindName })).toBeNull();
  expect(finish).toHaveBeenCalledTimes(1);
});
