import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { duringAccountChange, useAccountChangeStatus } from "./account-change";

it("verifies session mutations in order and keeps the last failed verification closed", async () => {
  const { result } = renderHook(useAccountChangeStatus);
  let finishFirst!: () => void;
  const firstMutation = new Promise<void>((resolve) => {
    finishFirst = resolve;
  });
  const firstVerify = vi.fn().mockResolvedValue(undefined);
  const secondMutation = vi.fn().mockResolvedValue(undefined);
  let attempts!: Promise<void>[];
  act(() => {
    attempts = [
      duringAccountChange(() => firstMutation, firstVerify),
      duringAccountChange(secondMutation, async () => {
        throw new Error("Verification failed");
      }),
    ];
  });
  await waitFor(() => expect(result.current).toBe("pending"));
  expect(secondMutation).not.toHaveBeenCalled();
  await act(async () => {
    finishFirst();
    await Promise.all(attempts);
  });
  expect(firstVerify.mock.invocationCallOrder[0]).toBeLessThan(
    secondMutation.mock.invocationCallOrder[0]!,
  );
  expect(result.current).toBe("unverified");
});
