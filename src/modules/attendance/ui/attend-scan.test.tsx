import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { t } from "@/i18n";
import { AttendScan } from "./attend-scan";

const { getChallenge, scan, authenticate } = vi.hoisted(() => ({
  getChallenge: vi.fn(),
  scan: vi.fn(),
  authenticate: vi.fn(),
}));

vi.mock("@tanstack/react-start", async (importOriginal) => ({
  ...(await importOriginal()),
  useServerFn: (handler: unknown) => handler,
}));
vi.mock("@simplewebauthn/browser", () => ({ startAuthentication: authenticate }));
vi.mock("../functions/attendance.functions", () => ({
  scanChallengeFn: getChallenge,
  scanAttendanceFn: scan,
}));

it("allows one scan at a time and returns the record named by the prompt", async () => {
  const recordId = "11111111-1111-4111-8111-111111111111";
  const proof = { options: {}, companyId: "company", challengeId: "challenge" };
  let release: (value: typeof proof) => void = () => {};
  getChallenge
    .mockReturnValueOnce(
      new Promise<typeof proof>((resolve) => {
        release = resolve;
      }),
    )
    .mockResolvedValueOnce(proof);
  authenticate.mockResolvedValue({ id: "test-credential" });
  scan
    .mockResolvedValueOnce({ outcome: "needs_intent", recordId })
    .mockResolvedValueOnce({ outcome: "checked_out", status: "ok", exception: null });

  render(<AttendScan token="11111111-1111-4111-8111-111111111111.1000.signature" />);
  const verify = await screen.findByRole("button", { name: t("phone.verify") });
  await waitFor(() => expect(verify).toBeEnabled());
  act(() => {
    verify.click();
    verify.click();
  });
  expect(getChallenge).toHaveBeenCalledTimes(1);
  expect(verify).toBeDisabled();

  await act(async () => release(proof));
  fireEvent.click(await screen.findByRole("button", { name: t("attend.checkOut") }));
  expect(await screen.findByText(t("attend.checkedOut"))).toBeInTheDocument();
  expect(scan).toHaveBeenCalledTimes(2);
  expect(scan).toHaveBeenLastCalledWith({
    data: expect.objectContaining({ intent: "check_out", promptedRecordId: recordId }),
  });
});

it("shows invalid-code feedback without requesting a passkey for malformed QR", () => {
  getChallenge.mockClear();
  render(<AttendScan token="not-a-uuid.1000.signature" />);
  expect(screen.getByRole("alert")).toHaveTextContent(t("attend.invalidQr"));
  expect(getChallenge).not.toHaveBeenCalled();
});

it("blocks a second submission after the server response is lost", async () => {
  getChallenge
    .mockReset()
    .mockResolvedValue({ options: {}, companyId: "company", challengeId: "challenge" });
  authenticate.mockResolvedValue({ id: "test-credential" });
  scan.mockReset().mockRejectedValue(new Error("Connection lost"));
  render(<AttendScan token="11111111-1111-4111-8111-111111111111.1000.signature" />);
  const verify = await screen.findByRole("button", { name: t("phone.verify") });
  await waitFor(() => expect(verify).toBeEnabled());
  fireEvent.click(verify);
  expect(await screen.findByRole("alert")).toHaveTextContent(t("attend.uncertain"));
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(scan).toHaveBeenCalledTimes(1);
});
