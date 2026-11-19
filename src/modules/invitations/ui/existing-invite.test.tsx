import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ExistingInvite } from "./existing-invite";
import { t } from "@/i18n";
const state = vi.hoisted(() => ({
  accept: vi.fn(),
  choose: vi.fn(),
  navigate: vi.fn(),
  signOut: vi.fn(),
  fetch: vi.fn(),
  cancel: vi.fn(),
  clear: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => state.navigate }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    fetchQuery: state.fetch,
    cancelQueries: state.cancel,
    clear: state.clear,
  }),
}));
vi.mock("../functions/invitation.functions", () => ({ acceptInviteAsSignedInFn: state.accept }));
vi.mock("@/modules/permissions/ui/use-session-context", () => ({
  sessionContextQuery: {},
  chooseWorkspace: state.choose,
}));
vi.mock("@/modules/permissions", () => ({ areaForWorkspace: () => "me" }));
vi.mock("@/lib/auth-client", () => ({ authClient: { signOut: state.signOut } }));
const ws = {
  kind: "company" as const,
  companyId: "70000000-0000-4000-8000-000000000001",
  companyName: "Salon",
  businessType: "salon" as const,
  role: "staff" as const,
  branchId: null,
  branchName: null,
};
const context = {
  user: { id: "sara", email: "sara@example.test", name: "Sara" },
  active: null,
  workspaces: [],
  permissions: [],
};
const invite = { email: "sara@example.test", companyName: "Salon", role: "staff" };
beforeEach(() => {
  vi.clearAllMocks();
  state.accept.mockResolvedValue({ companyId: ws.companyId });
  state.fetch.mockResolvedValue({ ...context, workspaces: [ws] });
  state.signOut.mockResolvedValue({});
});
it("matching existing account joins and selects the returned company workspace", async () => {
  render(<ExistingInvite token={"a".repeat(43)} invite={invite} context={context} />);
  fireEvent.click(
    screen.getByRole("button", { name: t("invite.join").replace("{company}", "Salon") }),
  );
  await waitFor(() => expect(state.navigate).toHaveBeenCalledWith({ href: "/me", replace: true }));
  expect(state.accept).toHaveBeenCalledWith({ data: { token: "a".repeat(43) } });
  expect(state.choose).toHaveBeenCalledWith(expect.anything(), expect.anything(), ws);
});
it("mismatched account cannot join and can sign out", async () => {
  render(
    <ExistingInvite
      token={"a".repeat(43)}
      invite={invite}
      context={{ ...context, user: { ...context.user, email: "other@example.test" } }}
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent(t("invite.INVITE_EMAIL_MISMATCH"));
  fireEvent.click(screen.getByRole("button", { name: t("invite.signOut") }));
  await waitFor(() => expect(state.signOut).toHaveBeenCalled());
  expect(state.accept).not.toHaveBeenCalled();
});

it("retries workspace selection without consuming an already accepted invite again", async () => {
  state.fetch.mockRejectedValueOnce(new Error("NETWORK_ERROR"));
  render(<ExistingInvite token={"a".repeat(43)} invite={invite} context={context} />);
  const button = screen.getByRole("button");
  fireEvent.click(button);
  await screen.findByRole("alert");
  fireEvent.click(button);
  await waitFor(() => expect(state.navigate).toHaveBeenCalledWith({ href: "/me", replace: true }));
  expect(state.accept).toHaveBeenCalledOnce();
});
