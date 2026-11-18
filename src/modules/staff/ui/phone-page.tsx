import { isAuthNotConfigured } from "@/lib/auth-errors";
import { Link } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { startAuthentication } from "@simplewebauthn/browser";
import { authClient } from "@/lib/auth-client";
import {
  startBindingFn,
  finishBindingFn,
  unbindPhoneFn,
  getPhoneManagementFn,
} from "@/modules/staff";
import { getMyCompanies } from "@/lib/tenancy.functions";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useActiveCompany } from "@/lib/active-company";
import { t } from "@/i18n";

const companiesQuery = queryOptions({
  queryKey: ["phone-companies"],
  queryFn: async () => {
    try {
      return { companies: await getMyCompanies(), error: null };
    } catch (error) {
      return {
        companies: [],
        error: isAuthNotConfigured(error)
          ? ("auth.notConfigured" as const)
          : ("attend.signInFirst" as const),
      };
    }
  },
});
const managementQueryKey = ["phone-management"];
const managementQuery = (companyId: string) =>
  queryOptions({
    queryKey: [...managementQueryKey, companyId],
    refetchOnMount: "always",
    queryFn: async ({ signal }) => {
      try {
        return { ...(await getPhoneManagementFn({ data: { companyId }, signal })), error: null };
      } catch (error) {
        return {
          canBind: false,
          isBound: false,
          browserBinding: null,
          canManage: false,
          staff: [],
          error: isAuthNotConfigured(error)
            ? ("auth.notConfigured" as const)
            : ("phone.error" as const),
        };
      }
    },
  });

export function PhonePage({ mode }: { mode: "binding" | "management" }) {
  const { data } = useSuspenseQuery(companiesQuery);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const pinned = useActiveCompany();
  const companyId =
    pinned !== undefined
      ? data.companies.some(({ id }) => id === pinned)
        ? (pinned ?? "")
        : ""
      : selected || data.companies[0]?.id || "";
  return (
    <main className="mx-auto max-w-lg px-4 py-8 sm:px-6 sm:py-16 space-y-6">
      <Link to="/">{t("app.name")}</Link>
      <h1 className="text-2xl font-bold">{t("phone.title")}</h1>
      {data.error ? (
        <p role="status">{t(data.error)}</p>
      ) : !companyId ? (
        <p>{t("phone.noCompanies")}</p>
      ) : (
        <>
          <div hidden={pinned !== undefined} className="space-y-2">
            <label htmlFor="phone-company" className="block">
              {t("phone.companyName")}
            </label>
            <Select dir="rtl" value={companyId} onValueChange={setSelected} disabled={busy}>
              <SelectTrigger id="phone-company">
                <SelectValue placeholder={t("phone.selectCompany")} />
              </SelectTrigger>
              <SelectContent>
                {data.companies
                  .filter(
                    (company, index, all) =>
                      all.findIndex((item) => item.id === company.id) === index,
                  )
                  .map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <Suspense fallback={<p role="status">{t("phone.loading")}</p>}>
            <PhoneActions
              mode={mode}
              key={companyId}
              companyId={companyId}
              busy={busy}
              setBusy={setBusy}
            />
          </Suspense>
        </>
      )}
    </main>
  );
}

function usePhoneActions(companyId: string, busy: boolean, setBusy: (busy: boolean) => void) {
  const { data, isFetching } = useSuspenseQuery(managementQuery(companyId));
  const queryClient = useQueryClient();
  const [userId, setUser] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState("");
  const begin = useServerFn(startBindingFn);
  const finish = useServerFn(finishBindingFn);
  const unbind = useServerFn(unbindPhoneFn);
  async function run(remove: boolean) {
    if (busy || (!remove && (isFetching || !data.canBind || data.isBound))) return;
    setBusy(true);
    setMessage("");
    try {
      if (remove) {
        if (
          !data.canManage ||
          !data.staff.some((staff) => staff.userId === userId && staff.isBound)
        )
          return;
        await unbind({ data: { companyId, userId } });
        setUser("");
        setConfirm(false);
      } else {
        const added = await authClient.passkey.addPasskey({ authenticatorAttachment: "platform" });
        if (added?.error)
          throw new Error(
            isAuthNotConfigured(added.error) ? "AUTH_NOT_CONFIGURED" : "PASSKEY_FAILED",
          );
        const proof = await begin({ data: { companyId } });
        const response = await startAuthentication({ optionsJSON: proof.options });
        await finish({ data: { companyId, challengeId: proof.challengeId, response } });
      }
      setMessage(t("phone.success"));
      await queryClient.invalidateQueries({ queryKey: managementQueryKey });
    } catch (e) {
      setMessage(t(isAuthNotConfigured(e) ? "auth.notConfigured" : "phone.error"));
    } finally {
      setBusy(false);
    }
  }
  return { data, userId, setUser, confirm, setConfirm, busy, isFetching, message, run };
}

function PhoneActions({
  companyId,
  busy,
  setBusy,
  mode,
}: {
  mode: "binding" | "management";
  companyId: string;
  busy: boolean;
  setBusy: (busy: boolean) => void;
}) {
  const actions = usePhoneActions(companyId, busy, setBusy);
  const { data, isFetching, message, run } = actions;
  const binding = data.browserBinding;
  if (isFetching) return <p role="status">{t("phone.loading")}</p>;
  if (data.error) return <p role="status">{t(data.error)}</p>;
  return (
    <section className="space-y-6">
      {mode === "binding" &&
        (binding ? (
          <div className="space-y-2">
            <p>{t("phone.boundCompany").replace("{company}", () => binding.companyName)}</p>
            <p className="text-muted-foreground">{t("phone.oneCompanyPerBrowser")}</p>
          </div>
        ) : (
          <>
            <p>{t(data.isBound ? "phone.bound" : "phone.notBound")}</p>
            <Button disabled={busy || !data.canBind || data.isBound} onClick={() => run(false)}>
              {t("phone.bind")}
            </Button>
          </>
        ))}
      {mode === "management" && data.canManage && <StaffPhoneControls actions={actions} />}
      <p role="status">{message}</p>
    </section>
  );
}

function StaffPhoneControls({ actions }: { actions: ReturnType<typeof usePhoneActions> }) {
  const { data, userId, setUser, confirm, setConfirm, busy, run } = actions;
  return (
    <div className="space-y-6">
      <label htmlFor="phone-staff" className="block">
        {t("phone.staffName")}
      </label>
      <Select
        dir="rtl"
        value={userId}
        onValueChange={(value) => {
          setUser(value);
          setConfirm(false);
        }}
        disabled={busy}
      >
        <SelectTrigger id="phone-staff">
          <SelectValue placeholder={t("phone.selectStaff")} />
        </SelectTrigger>
        <SelectContent>
          {data.staff
            .filter((staff) => staff.isBound)
            .map((staff) => (
              <SelectItem key={staff.userId} value={staff.userId}>
                {staff.displayName} · {staff.branchName}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
      {!data.staff.some((staff) => staff.isBound) && (
        <p className="text-muted-foreground">{t("phone.noStaff")}</p>
      )}
      {confirm && <p role="alert">{t("phone.confirmUnbind")}</p>}
      <div className="flex flex-wrap gap-3">
        <Button
          variant="destructive"
          disabled={busy || !userId}
          onClick={() => (confirm ? run(true) : setConfirm(true))}
        >
          {t("phone.unbind")}
        </Button>
        {confirm && (
          <Button variant="outline" disabled={busy} onClick={() => setConfirm(false)}>
            {t("phone.cancel")}
          </Button>
        )}
      </div>
    </div>
  );
}
