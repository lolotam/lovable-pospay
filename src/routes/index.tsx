import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getSystemStatus } from "@/lib/tenancy.functions";
import { t, type MessageKey } from "@/i18n";

const statusQuery = queryOptions({ queryKey: ["system-status"], queryFn: () => getSystemStatus() });

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PosPay — الحضور والعمولات للصالون" },
      {
        name: "description",
        content: "حضور رقمي للموظفات وعمولات تُحسب تلقائياً من الجلسات المسجّلة.",
      },
      { property: "og:title", content: "PosPay — الحضور والعمولات للصالون" },
      {
        property: "og:description",
        content: "حضور رقمي للموظفات وعمولات تُحسب تلقائياً من الجلسات المسجّلة.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(statusQuery),
  component: Index,
});

const modules: MessageKey[] = [
  "modules.staff",
  "modules.attendance",
  "modules.services",
  "modules.commissions",
  "modules.ratings",
  "modules.notifications",
];

function Row({ label, ok }: { label: MessageKey; ok: boolean }) {
  return (
    <li className="flex items-center justify-between border-b border-border py-3 last:border-0">
      <span>{t(label)}</span>
      <span className={ok ? "text-primary font-medium" : "text-destructive font-medium"}>
        {ok ? t("status.ready") : t("status.notConfigured")}
      </span>
    </li>
  );
}

function Index() {
  const { data } = useSuspenseQuery(statusQuery);
  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <p className="text-sm font-medium text-primary">{t("app.tagline")}</p>
      <h1 className="mt-3 text-4xl font-bold leading-tight md:text-5xl">{t("app.name")}</h1>
      <p className="mt-4 max-w-2xl text-lg text-muted-foreground">{t("app.description")}</p>
      <Link
        to="/sign-in"
        className="mt-8 inline-flex rounded-md bg-primary px-5 py-2.5 font-medium text-primary-foreground hover:bg-primary/90"
      >
        {t("auth.signIn")}
      </Link>
      <nav className="mt-6 flex flex-wrap gap-6">
        <Link to="/phone" className="text-primary underline">
          {t("phone.title")}
        </Link>
        <Link to="/attendance-questions" className="text-primary underline">
          {t("insights.title")}
        </Link>
      </nav>

      <div className="mt-14 grid gap-8 md:grid-cols-2">
        <section className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-bold">{t("status.title")}</h2>
          <ul className="mt-3 text-sm">
            <Row label="status.databaseUrl" ok={data.database} />
            <Row label="status.databaseReachable" ok={data.databaseReachable} />
            <Row label="status.auth" ok={data.auth} />
            <Row label="status.whatsapp" ok={data.whatsapp} />
          </ul>
        </section>
        <section className="rounded-lg border border-border bg-accent/40 p-6">
          <h2 className="text-lg font-bold">{t("modules.title")}</h2>
          <ol className="mt-3 space-y-2 text-sm">
            {modules.map((m, i) => (
              <li key={m} className="flex gap-3">
                <span className="text-primary font-bold">{i + 1}</span>
                {t(m)}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
