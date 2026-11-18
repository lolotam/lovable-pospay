import { Link, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

export function RouteNotFound() {
  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 py-16">
      <h1 className="text-2xl font-bold">{t("page.notFound")}</h1>
      <p>{t("page.notFoundBody")}</p>
      <Button asChild>
        <Link to="/">{t("page.home")}</Link>
      </Button>
    </main>
  );
}
export function RouteError({ reset }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 py-16">
      <h1 className="text-2xl font-bold">{t("page.error")}</h1>
      <p>{t("ws.failed")}</p>
      <Button onClick={() => void router.invalidate().then(reset)}>{t("page.retry")}</Button>
      <Button asChild variant="outline">
        <Link to="/">{t("page.home")}</Link>
      </Button>
    </main>
  );
}
