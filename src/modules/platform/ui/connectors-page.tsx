import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { t } from "@/i18n";
import { CONNECTORS, type ConnectorGroup } from "../domain/providers";
import { getConnectorsFn } from "../functions/connectors.functions";
import { ConnectorRow } from "./connector-row";

const GROUPS: ConnectorGroup[] = ["ai_account", "ai_key", "messaging"];

export function ConnectorsPage() {
  const q = useQuery({ queryKey: ["platform", "connectors"], queryFn: () => getConnectorsFn(), retry: false });
  const refetch = q.refetch;
  const onChange = useCallback(() => { void refetch(); }, [refetch]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-xl font-bold">{t("conn.title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("conn.subtitle")}</p>
      {q.isError && (
        <p role="alert" className="mt-8 rounded-md border border-border bg-warning-soft px-4 py-3 text-sm text-destructive">
          {t("conn.forbidden")}
        </p>
      )}
      {q.data && GROUPS.map((g) => (
        <section key={g} className="mt-8">
          <h2 className="mb-2 text-xs font-medium text-muted-foreground">{t(`conn.group.${g}`)}</h2>
          <div className="rounded-lg border border-border bg-card">
            {CONNECTORS.filter((c) => c.group === g).map((def) => (
              <ConnectorRow key={def.id} def={def} status={q.data} onChange={onChange} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
