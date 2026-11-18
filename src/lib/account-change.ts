import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
let pending = 0;
let lastChange: Promise<void> = Promise.resolve();
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

export function duringAccountChange<T>(
  change: () => Promise<T>,
  verify: () => Promise<unknown>,
): Promise<T> {
  pending++;
  notify();
  const run = lastChange.then(async () => {
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
  });
  lastChange = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
