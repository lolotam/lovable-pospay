import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { SessionContextDto } from "../contracts";
import { WorkspacesPage } from "./workspaces-page";

const { chooseWorkspace, invalidate, navigate } = vi.hoisted(() => ({
  chooseWorkspace: vi.fn(),
  invalidate: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("./use-session-context", () => ({ chooseWorkspace, sessionContextQuery: {} }));
vi.mock("./user-menu", () => ({ UserMenu: () => null }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useNavigate: () => navigate,
  useRouter: () => ({ invalidate }),
}));

const context: SessionContextDto = {
  user: { id: "mona", name: "Mona", email: "mona@example.test" },
  workspaces: [
    {
      kind: "company",
      companyId: "40000000-0000-4000-8000-000000000001",
      companyName: "Removed salon",
      businessType: "salon",
      role: "staff",
      branchId: null,
      branchName: null,
    },
  ],
  active: null,
  permissions: [],
};

it("reports a failed workspace choice and reloads the memberships", async () => {
  chooseWorkspace.mockRejectedValueOnce(new Error("FORBIDDEN"));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <WorkspacesPage context={context} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /Removed salon/ }));
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(invalidate).toHaveBeenCalledOnce();
  expect(navigate).not.toHaveBeenCalled();
});
