import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { scanAttendanceFn } from "../functions/attendance.functions";
import type { ScanResultDto } from "../contracts";
import { t, type MessageKey } from "@/i18n";

type Location = { latitude: number; longitude: number } | null;

function getLocation(): Promise<Location> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  });
}

const exceptionKey: Record<string, MessageKey> = { no_location: "attend.noLocation", outside_geofence: "attend.outside" };

export function AttendScan({ token }: { token: string }) {
  const scan = useServerFn(scanAttendanceFn);
  const [result, setResult] = useState<ScanResultDto | null>(null);
  const [error, setError] = useState<"auth" | "other" | null>(null);
  const [location, setLocation] = useState<Location | undefined>(undefined);

  const submit = useCallback(async (intent: "new_shift" | "check_out" | null, loc: Location) => {
    try {
      setResult(await scan({ data: { token, location: loc, intent } }));
    } catch (e) {
      setError(e instanceof Error && e.message.includes("UNAUTHENTICATED") ? "auth" : "other");
    }
  }, [scan, token]);

  useEffect(() => {
    getLocation().then((loc) => { setLocation(loc); submit(null, loc); });
  }, [submit]);

  if (error === "auth") return <Link to="/sign-in" className="text-primary underline">{t("attend.signInFirst")}</Link>;
  if (error) return <p className="text-destructive">{t("attend.error")}</p>;
  if (!result) return <p className="text-muted-foreground">{t("attend.locating")}</p>;

  if (result.outcome === "needs_intent") {
    return (
      <div className="space-y-4">
        <p>{t("attend.chooseIntent")}</p>
        <button onClick={() => submit("new_shift", location ?? null)} className="w-full rounded-md bg-primary py-3 font-medium text-primary-foreground">{t("attend.newShift")}</button>
        <button onClick={() => submit("check_out", location ?? null)} className="w-full rounded-md border border-input bg-card py-3 font-medium">{t("attend.checkOut")}</button>
      </div>
    );
  }
  if (result.outcome === "rejected") {
    return <p className="text-destructive">{t(result.reason === "invalid_qr" ? "attend.invalidQr" : "attend.notStaff")}</p>;
  }
  const title = result.outcome === "checked_in" ? "attend.checkedIn" : result.status === "closed_late" ? "attend.closedLate" : "attend.checkedOut";
  return (
    <div className="space-y-3">
      <p className="text-2xl font-bold text-primary">{t(title)}</p>
      {result.outcome === "checked_in" && result.lateMinutes > 0 && <p>{t("attend.late")}: {result.lateMinutes}</p>}
      {result.exception && <p className="text-sm text-muted-foreground">{t("attend.exception")} — {t(exceptionKey[result.exception] ?? "attend.outside")}</p>}
    </div>
  );
}
