import { Suspense, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { isAuthNotConfigured } from "@/lib/auth-errors";
import { duringAccountChange, useAccountChangeStatus } from "@/lib/account-change";
import { Button } from "@/components/ui/button";
import { authClient, verifyAuthSession } from "@/lib/auth-client";
import { operatorCompaniesQuery } from "./operator-companies-query";
import { t, type MessageKey } from "@/i18n";
export interface CompanyScopeProps {
  title: MessageKey;
  switchLocked?: boolean;
  children: (companyId: string, userId: string) => ReactNode;
}
export function CompanyScope(props: CompanyScopeProps) {
  const { data, error, isPending, isRefetching, refetch } = authClient.useSession();
  const accountChange = useAccountChangeStatus();
  const [selection, setSelection] = useState<{ userId: string; companyId: string } | null>(null);
  const retry = () =>
    void duringAccountChange(
      () => refetch({ query: { disableCookieCache: true } }),
      verifyAuthSession,
    );
  const loading = isPending || isRefetching || accountChange === "pending";
  const failed = accountChange === "unverified" || !!error;
  const userId = data?.user.id;
  return (
    <>
      {loading ? (
        <p role="status">{t("phone.loading")}</p>
      ) : isAuthNotConfigured(error) ? (
        <p role="status">{t("auth.notConfigured")}</p>
      ) : failed ? (
        <SessionVerificationError retry={retry} />
      ) : !userId ? (
        <p role="status">{t("attend.signInFirst")}</p>
      ) : null}
      {userId && (
        <div hidden={loading || failed} inert={loading || failed}>
          <SignedInCompanyScope
            key={userId}
            {...props}
            userId={userId}
            selected={selection?.userId === userId ? selection.companyId : ""}
            setSelected={(companyId) => setSelection({ userId, companyId })}
          />
        </div>
      )}
    </>
  );
}

function SessionVerificationError({ retry }: { retry: () => void }) {
  return (
    <div className="space-y-2">
      <p role="alert">{t("auth.sessionVerificationFailed")}</p>
      <Button type="button" onClick={retry}>
        {t("auth.retrySession")}
      </Button>
    </div>
  );
}

type SignedInProps = CompanyScopeProps & {
  userId: string;
  selected: string;
  setSelected: (companyId: string) => void;
};

function CompanyLookupError({ retry }: { retry: () => void }) {
  return (
    <div className="space-y-2">
      <p role="alert">{t("ops.forbidden")}</p>
      <Button type="button" onClick={retry}>
        {t("ops.retryLoad")}
      </Button>
    </div>
  );
}

function SignedInCompanyScope({
  title,
  children,
  switchLocked = false,
  userId,
  selected,
  setSelected,
}: SignedInProps) {
  const { data, isError, isFetchedAfterMount, fetchStatus, refetch } = useQuery(
    operatorCompaniesQuery(userId),
  );
  const checking = !isFetchedAfterMount || fetchStatus !== "idle";
  const companies = data?.companies ?? [];
  const companyId = companies.some(({ id }) => id === selected)
    ? selected
    : (companies[0]?.id ?? "");
  useEffect(() => {
    if (!checking && !isError && companyId && companyId !== selected) setSelected(companyId);
  }, [checking, companyId, isError, selected, setSelected]);
  return (
    <section className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold">{t(title)}</h1>
      {checking && !isError && <p role="status">{t("phone.loading")}</p>}
      {isError && <CompanyLookupError retry={() => void refetch()} />}
      {!isError && data?.error && !checking ? (
        <p role="status">{t(data.error)}</p>
      ) : companyId ? (
        <div hidden={checking || isError} inert={checking || isError} className="space-y-6">
          <label className="block space-y-2">
            <span>{t("phone.companyName")}</span>
            <select
              className="h-11 w-full max-w-md rounded-md border border-input bg-background px-3"
              value={companyId}
              disabled={switchLocked}
              onChange={(e) => setSelected(e.target.value)}
            >
              {companies
                .filter((c, i, a) => a.findIndex((v) => v.id === c.id) === i)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
          <Suspense fallback={<p role="status">{t("phone.loading")}</p>}>
            <div key={companyId}>{children(companyId, userId)}</div>
          </Suspense>
        </div>
      ) : !checking && !isError && !data?.error ? (
        <p>{t("phone.noCompanies")}</p>
      ) : null}
    </section>
  );
}
