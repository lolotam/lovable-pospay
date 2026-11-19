import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { t } from "@/i18n";
import type { InvitePreviewDto } from "../contracts";
import { AcceptInvitePage } from "./accept-invite-page";

const { previewInviteFn, acceptInviteFn } = vi.hoisted(() => ({
  previewInviteFn: vi.fn(),
  acceptInviteFn: vi.fn(),
}));
vi.mock("../functions/invitation.functions", () => ({ previewInviteFn, acceptInviteFn }));
vi.mock("./existing-invite", () => ({ ExistingInvite: () => null }));
vi.mock("@/modules/permissions", () => ({
  getSessionContext: async () => null,
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, search }: { children: React.ReactNode; search?: { redirect?: string } }) => (
    <a href={`/sign-in?redirect=${encodeURIComponent(search?.redirect ?? "")}`}>{children}</a>
  ),
}));

const tokenA = "a".repeat(43),
  tokenB = "b".repeat(43);
const invite = (companyName: string): InvitePreviewDto => ({
  email: `${companyName.toLowerCase()}@example.test`,
  role: "staff",
  companyName,
});

it("ignores a preview that answers after the token changed", async () => {
  let answerA!: (found: InvitePreviewDto) => void;
  previewInviteFn
    .mockReturnValueOnce(new Promise((resolve) => (answerA = resolve)))
    .mockResolvedValueOnce(invite("Beta"));
  const { rerender } = render(<AcceptInvitePage token={tokenA} />);
  rerender(<AcceptInvitePage token={tokenB} />);
  expect(await screen.findByText("Beta")).toBeInTheDocument();
  await act(async () => answerA(invite("Alpha")));
  expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
  expect(screen.getByText("Beta")).toBeInTheDocument();
});

it("signed-out existing account retains the sign-in return link after ACCOUNT_EXISTS", async () => {
  previewInviteFn.mockResolvedValue(invite("Salon"));
  acceptInviteFn.mockRejectedValue(new Error("ACCOUNT_EXISTS"));
  render(<AcceptInvitePage token={tokenA} />);
  const link = await screen.findByRole("link", { name: t("invite.existingSignIn") });
  expect(link).toHaveAttribute(
    "href",
    `/sign-in?redirect=${encodeURIComponent(`/invite?t=${tokenA}`)}`,
  );
  fireEvent.change(screen.getByLabelText(t("invite.name")), { target: { value: "Sara" } });
  fireEvent.change(screen.getByLabelText(t("invite.password")), {
    target: { value: "Strong-pass-123" },
  });
  fireEvent.change(screen.getByLabelText(t("invite.confirm")), {
    target: { value: "Strong-pass-123" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: t("invite.create") }).closest("form") as HTMLFormElement,
  );
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(t("invite.ACCOUNT_EXISTS")),
  );
  expect(screen.getByRole("link", { name: t("invite.existingSignIn") })).toHaveAttribute(
    "href",
    `/sign-in?redirect=${encodeURIComponent(`/invite?t=${tokenA}`)}`,
  );
});
