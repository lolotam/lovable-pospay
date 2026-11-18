import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
let pending = 0;
let revision = 0;
let verificationFailed = false;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  for (const listener of listeners) listener();
}

export function useAccountChangeStatus() {
  return useSyncExternalStore(
    subscribe,
    () => (pending > 0 ? "pending" : verificationFailed ? "unverified" : "idle"),
    () => "idle" as const,
  );
}

export async function duringAccountChange<T>(
  change: () => Promise<T>,
  verify: () => Promise<void>,
): Promise<T> {
  const current = ++revision;
  pending++;
  notify();
  try {
    return await change();
  } finally {
    try {
      await verify();
      if (current === revision) verificationFailed = false;
    } catch {
      if (current === revision) verificationFailed = true;
    } finally {
      pending--;
      notify();
    }
  }
}
