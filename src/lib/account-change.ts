import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
let pending = 0;
let verificationFailed = false;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  for (const listener of listeners) listener();
}

export function useAccountChangePending() {
  return useSyncExternalStore(
    subscribe,
    () => pending > 0 || verificationFailed,
    () => false,
  );
}

export async function duringAccountChange<T>(
  change: () => Promise<T>,
  verify: () => Promise<unknown>,
): Promise<T> {
  pending++;
  notify();
  try {
    return await change();
  } finally {
    try {
      await verify();
      verificationFailed = false;
    } catch {
      verificationFailed = true;
    } finally {
      pending--;
      notify();
    }
  }
}
