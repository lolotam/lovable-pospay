import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/sign-in")({
  head: () => ({
    meta: [
      { title: "تسجيل الدخول — PosPay" },
      { name: "description", content: "دخول الإدارة والموظفات إلى PosPay." },
      { property: "og:title", content: "تسجيل الدخول — PosPay" },
      { property: "og:description", content: "دخول الإدارة والموظفات إلى PosPay." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SignIn,
});

function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const { error } = await authClient.signIn.email({ email, password });
    setMessage(error ? "تعذّر الدخول. تحقق من البيانات." : "تم الدخول.");
  }

  return (
    <main className="mx-auto max-w-sm px-6 py-20">
      <h1 className="text-2xl font-bold">دخول الإدارة</h1>
      <p className="mt-2 text-sm text-muted-foreground">دخول الموظفات برقم الهاتف وPasskey يأتي في وحدة الحضور.</p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <input type="email" required placeholder="البريد الإلكتروني" value={email} onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-input bg-card px-3 py-2" dir="ltr" />
        <input type="password" required placeholder="كلمة المرور" value={password} onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-input bg-card px-3 py-2" dir="ltr" />
        <button className="w-full rounded-md bg-primary py-2.5 font-medium text-primary-foreground hover:bg-primary/90">دخول</button>
        {message && <p className="text-sm">{message}</p>}
      </form>
    </main>
  );
}
