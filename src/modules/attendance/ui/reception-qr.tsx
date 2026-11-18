import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useServerFn } from "@tanstack/react-start";
import { getBranchQrFn } from "../functions/attendance.functions";
import { t } from "@/i18n";
import { isAuthNotConfigured } from "@/lib/auth-errors";

const REFRESH_MS = 50_000;

export function ReceptionQr({ branchId }: { branchId: string }) {
  const fetchQr = useServerFn(getBranchQrFn);
  const [image, setImage] = useState<string | null>(null);
  const [branchName, setBranchName] = useState("");
  const [failed, setFailed] = useState<false | "forbidden" | "notConfigured">(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const qr = await fetchQr({ data: { branchId } });
        const url = `${window.location.origin}/attend?t=${encodeURIComponent(qr.token)}`;
        const dataUrl = await QRCode.toDataURL(url, { width: 480, margin: 1 });
        if (active) {
          setImage(dataUrl);
          setBranchName(qr.branchName);
          setFailed(false);
        }
      } catch (e) {
        if (active) setFailed(isAuthNotConfigured(e) ? "notConfigured" : "forbidden");
      }
    }
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [branchId, fetchQr]);

  if (failed)
    return (
      <p className="text-destructive">
        {t(failed === "notConfigured" ? "auth.notConfigured" : "qr.forbidden")}
      </p>
    );
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <h1 className="text-3xl font-bold">{t("qr.title")}</h1>
      <p className="text-lg text-muted-foreground">{branchName}</p>
      {image && (
        <img
          src={image}
          alt={t("qr.title")}
          className="aspect-square w-full max-w-80 rounded-lg bg-card p-3"
        />
      )}
      <p className="text-sm text-muted-foreground">{t("qr.refreshes")}</p>
    </div>
  );
}
