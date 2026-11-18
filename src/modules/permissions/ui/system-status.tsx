import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getSystemStatus } from "@/lib/tenancy.functions";
import { t, type MessageKey } from "@/i18n";

export const statusQuery = queryOptions({
  queryKey: ["system-status"],
  queryFn: () => getSystemStatus(),
});
export function SystemStatus() {
  const { data } = useSuspenseQuery(statusQuery);
  const rows: [MessageKey, boolean][] = [
    ["status.databaseUrl", data.database],
    ["status.databaseReachable", data.databaseReachable],
    ["status.auth", data.auth],
    ["status.whatsapp", data.whatsapp],
  ];
  return (
    <section className="mx-auto max-w-5xl px-4 pb-12 sm:px-6">
      <h2 className="text-lg font-bold">{t("status.title")}</h2>
      <ul className="mt-3 max-w-lg">
        {rows.map(([label, ok]) => (
          <li
            key={label}
            className="flex flex-wrap justify-between gap-2 border-b border-border py-3 text-sm"
          >
            <span>{t(label)}</span>
            <span className={ok ? "text-success" : "text-destructive"}>
              {t(ok ? "status.ready" : "status.notConfigured")}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
