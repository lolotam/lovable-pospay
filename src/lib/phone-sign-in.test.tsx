import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { PhoneSignIn } from "./phone-sign-in";
import { t } from "@/i18n";
const state = vi.hoisted(() => ({ passkey: vi.fn(), verify: vi.fn() }));
vi.mock("./auth-client", () => ({
  authClient: { signIn: { passkey: state.passkey } },
  verifyAuthSession: state.verify,
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("PublicKeyCredential", class {});
  state.verify.mockResolvedValue("mona");
});
it("hides phone sign-in when WebAuthn is unavailable", () => {
  vi.stubGlobal("PublicKeyCredential", undefined);
  render(<PhoneSignIn disabled={false} onSuccess={vi.fn()} />);
  expect(screen.queryByRole("button")).toBeNull();
});
it("passes successful sign-in to the existing destination flow", async () => {
  state.passkey.mockResolvedValue({ data: { user: { id: "mona" } } });
  const finish = vi.fn();
  render(<PhoneSignIn disabled={false} onSuccess={finish} />);
  fireEvent.click(screen.getByRole("button", { name: t("signIn.phone") }));
  await waitFor(() => expect(finish).toHaveBeenCalledWith({ user: { id: "mona" } }));
});
it("shows the generic failure and permits retry on cancelled sign-in", async () => {
  state.passkey.mockRejectedValue(new Error("NotAllowedError"));
  render(<PhoneSignIn disabled={false} onSuccess={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: t("signIn.phone") }));
  expect(await screen.findByRole("alert")).toHaveTextContent(t("signIn.passkeyFailed"));
  expect(screen.getByRole("button")).toBeEnabled();
});
