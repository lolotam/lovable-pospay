import { act, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { InvitePreviewDto } from "../contracts";
import { AcceptInvitePage } from "./accept-invite-page";

const { previewInviteFn } = vi.hoisted(() => ({ previewInviteFn: vi.fn() }));
vi.mock("../functions/invitation.functions", () => ({ previewInviteFn, acceptInviteFn: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-router", () => ({ Link: () => null }));

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
