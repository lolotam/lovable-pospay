import { describe, expect, it } from "vitest";
import { getManagerPinStatus, setManagerPin } from "./set-manager-pin";
import type { ManagerPinRepository } from "../ports/manager-pin-repository";

function fakeRepo() {
  const calls: string[] = [];
  const repo: ManagerPinRepository = {
    setPin: async (pin) => {
      calls.push(`set:${pin}`);
    },
    hasPin: async () => {
      calls.push("has");
      return true;
    },
    listFailedAttempts: async () => [],
  };
  return { repo, calls };
}

describe("setManagerPin (020 B2)", () => {
  it("saves a valid four-digit PIN unchanged", async () => {
    const f = fakeRepo();
    await setManagerPin(f.repo, "0123");
    expect(f.calls).toEqual(["set:0123"]);
  });

  it.each(["", "123", "12345", "12a4", "١٢٣٤", "12 4"])("rejects %s", async (pin) => {
    const f = fakeRepo();
    await expect(setManagerPin(f.repo, pin)).rejects.toThrow("INVALID_PIN");
    expect(f.calls).toEqual([]);
  });

  it("reports the PIN status without returning the PIN", async () => {
    const f = fakeRepo();
    await expect(getManagerPinStatus(f.repo)).resolves.toBe(true);
    expect(f.calls).toEqual(["has"]);
  });
});
