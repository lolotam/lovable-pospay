import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getSystemStatus } from "@/lib/tenancy.functions";

const statusQuery = queryOptions({ queryKey: ["system-status"], queryFn: () => getSystemStatus() });

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PosPay — الحضور والعمولات للصالون" },
      { name: "description", content: "حضور رقمي للموظفات وعمولات تُحسب تلقائياً من الجلسات المسجّلة." },
      { property: "og:title", content: "PosPay — الحضور والعمولات للصالون" },
      { property: "og:description", content: "حضور رقمي للموظفات وعمولات تُحسب تلقائياً من الجلسات المسجّلة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(statusQuery),
  component: Index,
});

const modules = [
  "الموظفات والجداول والمستندات",
  "الحضور عبر QR وبطاقة الباركود",
  "الخدمات والجلسات والباقات",
  "محرك العمولات والكشف الشهري",
  "تقييمات العملاء عبر واتساب",
  "الإشعارات والتنبيهات",
];

function Row({ label, ok }: { label: string; ok: boolean }) {
  return (
    <li className="flex items-center justify-between border-b border-border py-3 last:border-0">
      <span>{label}</span>
      <span className={ok ? "text-primary font-medium" : "text-destructive font-medium"}>
        {ok ? "جاهز" : "غير مضبوط"}
      </span>
    </li>
  );
}

function Index() {
  const { data } = useSuspenseQuery(statusQuery);
  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <p className="text-sm font-medium text-primary">المرحلة الأولى · تجربة الصالون</p>
      <h1 className="mt-3 text-4xl font-bold leading-tight md:text-5xl">PosPay</h1>
      <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
        حضور رقمي للموظفات، وعمولات تُحسب تلقائياً من جلسات الخدمة، وكشف شهري يعتمده المدير ثم المالك.
      </p>
      <Link to="/sign-in" className="mt-8 inline-flex rounded-md bg-primary px-5 py-2.5 font-medium text-primary-foreground hover:bg-primary/90">
        تسجيل الدخول
      </Link>

      <div className="mt-14 grid gap-8 md:grid-cols-2">
        <section className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-bold">حالة التشغيل</h2>
          <ul className="mt-3 text-sm">
            <Row label="رابط قاعدة البيانات" ok={data.database} />
            <Row label="الاتصال بقاعدة البيانات" ok={data.databaseReachable} />
            <Row label="نظام الدخول" ok={data.auth} />
            <Row label="مزوّد واتساب" ok={data.whatsapp} />
          </ul>
        </section>
        <section className="rounded-lg border border-border bg-accent/40 p-6">
          <h2 className="text-lg font-bold">وحدات المرحلة الأولى</h2>
          <ol className="mt-3 space-y-2 text-sm">
            {modules.map((m, i) => (
              <li key={m} className="flex gap-3"><span className="text-primary font-bold">{i + 1}</span>{m}</li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
