import { Suspense, useState, type ReactNode } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { isAuthNotConfigured } from "@/lib/auth-errors";
import { authClient } from "@/lib/auth-client";
import { operatorCompaniesQuery } from "./operator-companies-query";
import { t, type MessageKey } from "@/i18n";
export interface CompanyScopeProps {
  title: MessageKey;
  switchLocked?: boolean;
  children: (companyId: string, userId: string) => ReactNode;
}
export function CompanyScope(props: CompanyScopeProps) {
  const { data, error, isPending } = authClient.useSession();
  if (isPending) return <p role="status">{t("phone.loading")}</p>;
  const userId = data?.user.id;
  if (!userId) {
    return (
      <p role="status">
        {t(isAuthNotConfigured(error) ? "auth.notConfigured" : "attend.signInFirst")}
      </p>
    );
  }
  return (
    <Suspense key={userId} fallback={<p role="status">{t("phone.loading")}</p>}>
      <SignedInCompanyScope {...props} userId={userId} />
    </Suspense>
  );
}

function SignedInCompanyScope({
  title,
  children,
  switchLocked = false,
  userId,
}: CompanyScopeProps & { userId: string }) {
  const { data } = useSuspenseQuery(operatorCompaniesQuery(userId));
  const [selected, setSelected] = useState("");
  const companyId = data.companies.some(({ id }) => id === selected)
    ? selected
    : (data.companies[0]?.id ?? "");
  return (
    <section className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold">{t(title)}</h1>
      {data.error ? (
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
