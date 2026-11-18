import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { BranchQrDto } from "../contracts";
import { isAuthNotConfigured } from "@/lib/auth-errors";

type FetchQr = (input: { data: { branchId: string } }) => Promise<BranchQrDto>;
type Failure = false | "forbidden" | "notConfigured" | "expired";
interface QrState {
  branchId: string;
  image: string | null;
  branchName: string;
  failed: Failure;
}

function emptyState(branchId: string, failed: Failure = false): QrState {
  return { branchId, image: null, branchName: "", failed };
}

class QrPolling {
  private active = true;
  private loading = false;
  private deadline = 0;
  private expiryTimer: ReturnType<typeof setTimeout> | undefined;
  private interval: ReturnType<typeof setInterval> | undefined;

  constructor(
    private branchId: string,
    private fetchQr: FetchQr,
    private publish: (state: QrState) => void,
  ) {}

  start() {
    this.publish(emptyState(this.branchId));
    void this.load();
    this.interval = setInterval(() => void this.load(), 50_000);
    window.addEventListener("focus", this.resume);
    document.addEventListener("visibilitychange", this.resume);
  }

  stop() {
    this.active = false;
    clearInterval(this.interval);
    clearTimeout(this.expiryTimer);
    window.removeEventListener("focus", this.resume);
    document.removeEventListener("visibilitychange", this.resume);
  }

  private resume = () => {
    if (this.deadline && performance.now() >= this.deadline) {
      this.publish(emptyState(this.branchId, "expired"));
      void this.load();
    }
  };

  private async load() {
    if (!this.active || this.loading) return;
    this.loading = true;
    const requestedAt = performance.now();
    try {
      const qr = await this.fetchQr({ data: { branchId: this.branchId } });
      // وقت الإصدار على السيرفر مقرب للثانية؛ نحجز ثانية لعدم عرض كود منتهٍ.
      const deadline = requestedAt + Math.max(0, qr.expiresInSeconds - 1) * 1000;
      const url = `${window.location.origin}/attend?t=${encodeURIComponent(qr.token)}`;
      const image = await QRCode.toDataURL(url, { width: 480, margin: 1 });
      if (!this.active) return;
      if (!Number.isFinite(deadline) || performance.now() >= deadline) {
        this.publish(emptyState(this.branchId, "expired"));
        return;
      }
      this.deadline = deadline;
      clearTimeout(this.expiryTimer);
      this.expiryTimer = setTimeout(() => this.resume(), deadline - performance.now());
      this.publish({ branchId: this.branchId, image, branchName: qr.branchName, failed: false });
    } catch (error) {
      if (this.active) {
        clearTimeout(this.expiryTimer);
        this.deadline = 0;
        this.publish(
          emptyState(this.branchId, isAuthNotConfigured(error) ? "notConfigured" : "forbidden"),
        );
      }
    } finally {
      this.loading = false;
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
