import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

export const Route = createFileRoute("/attendance-questions")({
  head: () => ({
    meta: [
      { title: "أسئلة الحضور — PosPay" },
      { name: "description", content: "أسئلة مدير الصالون عن التأخير والورديات." },
      { property: "og:title", content: "أسئلة الحضور — PosPay" },
      { property: "og:description", content: "أسئلة مدير الصالون عن التأخير والورديات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: QuestionsPage,
});
function QuestionsPage() {
  const [question, setQuestion] = useState("");
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-16 space-y-6">
      <Link to="/">{t("app.name")}</Link>
      <h1 className="text-2xl font-bold">{t("insights.title")}</h1>
      <p role="status" className="text-muted-foreground">
        {t("insights.disabled")}
      </p>
      <label className="block">
        {t("insights.question")}
        <textarea
          maxLength={2000}
          rows={5}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          className="mt-2 w-full rounded-md border border-input p-3"
        />
      </label>
      <Button disabled>{t("insights.ask")}</Button>
    </main>
  );
}
