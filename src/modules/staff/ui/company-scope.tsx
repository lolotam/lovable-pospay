import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { CatchBoundary } from "@tanstack/react-router";
import { QueryErrorResetBoundary, useSuspenseQuery } from "@tanstack/react-query";
import { isAuthNotConfigured } from "@/lib/auth-errors";
import {
  clearAccountVerificationFailure,
  duringAccountChange,
  useAccountChangeStatus,
} from "@/lib/account-change";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
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
  const sawRefresh = useRef(false);
  useEffect(() => {
    if (accountChange !== "unverified") {
      sawRefresh.current = false;
    } else if (isRefetching) {
      sawRefresh.current = true;
    } else if (sawRefresh.current && !error && !isPending) {
      clearAccountVerificationFailure();
    }
  }, [accountChange, error, isPending, isRefetching]);
  if (isPending || isRefetching || accountChange === "pending")
    return <p role="status">{t("phone.loading")}</p>;
  const retry = () =>
    void duringAccountChange(
      async () => undefined,
      () => refetch({ query: { disableCookieCache: true } }),
    );
  if (isAuthNotConfigured(error)) return <p role="status">{t("auth.notConfigured")}</p>;
  if (accountChange === "unverified" || error) return <SessionVerificationError retry={retry} />;
  const userId = data?.user.id;
  if (!userId) return <p role="status">{t("attend.signInFirst")}</p>;
  return (
    <AuthenticatedCompanies
      {...props}
      userId={userId}
      selected={selection?.userId === userId ? selection.companyId : ""}
      setSelected={(companyId) => setSelection({ userId, companyId })}
    />
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

function AuthenticatedCompanies(props: SignedInProps) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <CatchBoundary
          getResetKey={() => props.userId}
          errorComponent={({ reset: resetView }) => (
            <CompanyLookupError
              retry={() => {
                reset();
                resetView();
              }}
            />
          )}
        >
          <Suspense key={props.userId} fallback={<p role="status">{t("phone.loading")}</p>}>
            <SignedInCompanyScope {...props} />
          </Suspense>
        </CatchBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}

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
  const { data, isError, refetch } = useSuspenseQuery(operatorCompaniesQuery(userId));
  const companyId = data.companies.some(({ id }) => id === selected)
    ? selected
    : (data.companies[0]?.id ?? "");
  useEffect(() => {
    if (companyId && companyId !== selected) setSelected(companyId);
  }, [companyId, selected, setSelected]);
  return (
    <section className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold">{t(title)}</h1>
      {isError ? (
        <CompanyLookupError retry={() => void refetch()} />
      ) : data.error ? (
        <p role="status">{t(data.error)}</p>
      ) : !companyId ? (
        <p>{t("phone.noCompanies")}</p>
      ) : (
        <>
          <label className="block space-y-2">
            <span>{t("phone.companyName")}</span>
            <select
              className="h-11 w-full max-w-md rounded-md border border-input bg-background px-3"
              value={companyId}
              disabled={switchLocked}
              onChange={(e) => setSelected(e.target.value)}
            >
              {data.companies
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
        </>
      )}
    </section>
  );
}
