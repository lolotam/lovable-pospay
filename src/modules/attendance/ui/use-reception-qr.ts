import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { BranchQrDto } from "../contracts";
import { isAuthNotConfigured } from "@/lib/auth-errors";

type FetchQr = (input: { data: { branchId: string }; signal: AbortSignal }) => Promise<BranchQrDto>;
const QR_ATTEMPT_TIMEOUT_MS = 8_000;
const QR_REFRESH_INTERVAL_MS = 50_000;
const QR_RETRY_DELAY_MS = 3_000;
type Failure = false | "forbidden" | "notConfigured" | "expired" | "unavailable";
interface QrState {
  branchId: string;
  image: string | null;
  branchName: string;
  failed: Failure;
}

function emptyState(branchId: string, failed: Failure = false): QrState {
  return { branchId, image: null, branchName: "", failed };
}

function isAuthorizationFailure(error: unknown): boolean {
  if (error instanceof Error && ["FORBIDDEN", "UNAUTHENTICATED"].includes(error.message))
    return true;
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error.status === 401 || error.status === 403)
  );
}

class QrPolling {
  private active = true;
  private attempt: AbortController | undefined;
  private deadline = 0;
  private expiryTimer: ReturnType<typeof setTimeout> | undefined;
  private pollTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private branchId: string,
    private fetchQr: FetchQr,
    private publish: (state: QrState) => void,
  ) {}

  start() {
    this.publish(emptyState(this.branchId));
    void this.load();
    window.addEventListener("focus", this.resume);
    document.addEventListener("visibilitychange", this.resume);
  }

  stop() {
    this.active = false;
    this.attempt?.abort();
    clearTimeout(this.pollTimer);
    clearTimeout(this.expiryTimer);
    window.removeEventListener("focus", this.resume);
    document.removeEventListener("visibilitychange", this.resume);
  }

  private resume = () => {
    if (this.deadline && performance.now() >= this.deadline) {
      this.deadline = 0;
      this.publish(emptyState(this.branchId, "expired"));
      void this.load();
    }
  };

  private expire = () => {
    const remaining = this.deadline - performance.now();
    if (remaining > 0) {
      this.expiryTimer = setTimeout(this.expire, Math.ceil(remaining));
      return;
    }
    this.resume();
  };

  private async load() {
    if (!this.active || this.attempt) return;
    clearTimeout(this.pollTimer);
    const attempt = new AbortController();
    this.attempt = attempt;
    const { signal } = attempt;
    const timeout = setTimeout(() => attempt.abort(), QR_ATTEMPT_TIMEOUT_MS);
    const cancelled = new Promise<never>((_, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
    const requestedAt = performance.now();
    let nextPoll = requestedAt + QR_REFRESH_INTERVAL_MS;
    try {
      const qr = await Promise.race([
        this.fetchQr({ data: { branchId: this.branchId }, signal }),
        cancelled,
      ]);
      // وقت الإصدار على السيرفر مقرب للثانية؛ نحجز ثانية لعدم عرض كود منتهٍ.
      const deadline = requestedAt + Math.max(0, qr.expiresInSeconds - 1) * 1000;
      const url = `${window.location.origin}/attend?t=${encodeURIComponent(qr.token)}`;
      const image = await Promise.race([
        QRCode.toDataURL(url, { width: 480, margin: 1 }),
        cancelled,
      ]);
      signal.throwIfAborted();
      if (!this.active) return;
      if (!Number.isFinite(deadline) || performance.now() >= deadline) {
        if (performance.now() >= this.deadline) this.publish(emptyState(this.branchId, "expired"));
        nextPoll = performance.now() + QR_RETRY_DELAY_MS;
        return;
      }
      this.deadline = deadline;
      clearTimeout(this.expiryTimer);
      this.expiryTimer = setTimeout(this.expire, Math.ceil(deadline - performance.now()));
      this.publish({ branchId: this.branchId, image, branchName: qr.branchName, failed: false });
    } catch (error) {
      if (!this.active) return;
      if (error instanceof Error && isAuthNotConfigured(error)) {
        clearTimeout(this.expiryTimer);
        this.deadline = 0;
        this.publish(emptyState(this.branchId, "notConfigured"));
      } else if (isAuthorizationFailure(error)) {
        clearTimeout(this.expiryTimer);
        this.deadline = 0;
        this.publish(emptyState(this.branchId, "forbidden"));
      } else {
        if (performance.now() >= this.deadline)
          this.publish(emptyState(this.branchId, "unavailable"));
        nextPoll = performance.now() + QR_RETRY_DELAY_MS;
      }
    } finally {
      clearTimeout(timeout);
      this.attempt = undefined;
      if (this.active) {
        this.pollTimer = setTimeout(
          () => void this.load(),
          Math.max(0, nextPoll - performance.now()),
        );
      }
    }
  }
}

export function useReceptionQr(branchId: string, fetchQr: FetchQr): QrState {
  const [state, setState] = useState(() => emptyState(branchId));
  useEffect(() => {
    const polling = new QrPolling(branchId, fetchQr, setState);
    polling.start();
    return () => polling.stop();
  }, [branchId, fetchQr]);
  return state.branchId === branchId ? state : emptyState(branchId);
}
