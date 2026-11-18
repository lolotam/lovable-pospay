import { isAuthNotConfigured } from "@/lib/auth-errors";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { scanAttendanceFn, scanChallengeFn } from "../functions/attendance.functions";
import { startAuthentication } from "@simplewebauthn/browser";
import { Button } from "@/components/ui/button";
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

const exceptionKey: Record<string, MessageKey> = {
  no_location: "attend.noLocation",
  outside_geofence: "attend.outside",
};

export function AttendScan({ token }: { token: string }) {
  const scan = useServerFn(scanAttendanceFn);
  const getChallenge = useServerFn(scanChallengeFn);
  const [result, setResult] = useState<ScanResultDto | null>(null);
  const [error, setError] = useState<"auth" | "notConfigured" | "other" | null>(null);
  const [location, setLocation] = useState<Location | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);

  const submit = useCallback(
    async (intent: "new_shift" | "check_out" | null, loc: Location, promptedRecordId?: string) => {
      if (submitting.current) return;
      submitting.current = true;
      setPending(true);
      setError(null);
      try {
        const proof = await getChallenge({ data: { branchId: token.split(".")[0] ?? "" } });
        const response = await startAuthentication({ optionsJSON: proof.options });
        setResult(
          await scan({
            data: {
              token,
              location: loc,
              intent,
              promptedRecordId,
              companyId: proof.companyId,
              challengeId: proof.challengeId,
              response,
            },
          }),
        );
      } catch (e) {
        setError(
          isAuthNotConfigured(e)
            ? "notConfigured"
            : e instanceof Error && e.message.includes("UNAUTHENTICATED")
              ? "auth"
              : "other",
        );
      } finally {
        submitting.current = false;
        setPending(false);
      }
    },
    [scan, token, getChallenge],
  );

  useEffect(() => {
    getLocation().then(setLocation);
  }, []);

  if (error === "auth")
    return (
      <Link to="/sign-in" className="text-primary underline">
        {t("attend.signInFirst")}
      </Link>
    );
  if (error === "notConfigured")
    return <p className="text-destructive">{t("auth.notConfigured")}</p>;
  if (!result)
    return (
      <div className="space-y-4">
        {error && (
          <p role="alert" className="text-destructive">
            {t("attend.error")}
          </p>
        )}
        <Button
          disabled={pending || location === undefined}
          onClick={() => submit(null, location ?? null)}
        >
          {t("phone.verify")}
        </Button>
      </div>
    );

  if (result.outcome === "needs_intent") {
    return (
      <div className="space-y-4">
        <p>{t("attend.chooseIntent")}</p>
        {error && (
          <p role="alert" className="text-destructive">
            {t("attend.error")}
          </p>
        )}
        <Button
          disabled={pending}
          onClick={() => submit("new_shift", location ?? null, result.recordId)}
          className="w-full"
        >
          {t("attend.newShift")}
        </Button>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => submit("check_out", location ?? null, result.recordId)}
          className="w-full"
        >
          {t("attend.checkOut")}
        </Button>
      </div>
    );
  }
  if (result.outcome === "rejected") {
    if (result.reason === "stale_intent") {
      return (
        <p role="alert" className="text-destructive">
          {t("attend.staleIntent")}
        </p>
      );
    }
    return (
      <p className="text-destructive">
        {t(result.reason === "invalid_qr" ? "attend.invalidQr" : "attend.notStaff")}
      </p>
    );
  }
  const title =
    result.outcome === "checked_in"
      ? "attend.checkedIn"
      : result.status === "closed_late"
        ? "attend.closedLate"
        : "attend.checkedOut";
  return (
    <div className="space-y-3">
      <p className="text-2xl font-bold text-primary">{t(title)}</p>
      {result.outcome === "checked_in" && result.lateMinutes > 0 && (
        <p>
          {t("attend.late")}: {result.lateMinutes}
        </p>
      )}
      {result.exception && (
        <p className="text-sm text-muted-foreground">
          {t("attend.exception")} — {t(exceptionKey[result.exception] ?? "attend.outside")}
        </p>
      )}
    </div>
  );
}
