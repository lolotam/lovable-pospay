import { forwardRef, type HTMLAttributes } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getBranchQrFn } from "../functions/attendance.functions";
import { t } from "@/i18n";
import { useReceptionQr } from "./use-reception-qr";
import { cn } from "@/lib/utils";

export interface ReceptionQrProps extends HTMLAttributes<HTMLDivElement> {
  branchId: string;
}

export const ReceptionQr = forwardRef<HTMLDivElement, ReceptionQrProps>(function ReceptionQr(
  { branchId, className, ...props },
  ref,
) {
  const fetchQr = useServerFn(getBranchQrFn);
  const { image, branchName, failed } = useReceptionQr(branchId, fetchQr);
  return (
    <div
      ref={ref}
      className={cn("flex flex-col items-center gap-6 text-center", className)}
      {...props}
    >
      <h1 className="text-3xl font-bold">{t("qr.title")}</h1>
      <p className="text-lg text-muted-foreground">{branchName}</p>
      {image && (
        <img
          src={image}
          alt={t("qr.title")}
          className="aspect-square w-full max-w-80 rounded-lg bg-card p-3"
        />
      )}
      <p role="status" className={failed ? "text-destructive" : "text-sm text-muted-foreground"}>
        {t(
          failed === "notConfigured"
            ? "auth.notConfigured"
            : failed === "forbidden"
              ? "qr.forbidden"
              : failed === "expired"
                ? "qr.expired"
                : failed === "unavailable"
                  ? "qr.unavailable"
                  : image
                    ? "qr.refreshes"
                    : "qr.loading",
        )}
      </p>
    </div>
  );
});
