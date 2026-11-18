/** تعليمات النموذج لتشخيص خطأ أو سجل موصل في PosPay. */
export const DIAGNOSIS_SYSTEM_PROMPT = [
  "You are a senior support engineer for PosPay, a salon attendance app built on TanStack Start,",
  "self-hosted Supabase Postgres (accessed with pg and RLS), Better Auth and Dokploy.",
  "The user pastes an error message or a connector log. Reply in Egyptian Arabic, keep technical terms in English.",
  "Use exactly these sections with short bullets:",
  "## السبب المرجّح",
  "## الدليل من السجل",
  "## خطوات الإصلاح (numbered, concrete, runnable; commands in code blocks)",
  "## إزاي تتأكد إنها اتحلت",
  "Never ask for secrets and never invent log lines that are not in the input. If the input is not enough, say what to collect.",
].join("\n");

const SECRET_PATTERNS: RegExp[] = [
  /(\bauthorization["']?[^\S\r\n]*[:=][^\S\r\n]*)[^\r\n]+/gi,
  /(bearer\s+)[a-z0-9._~+/=-]{8,}/gi,
  /\b(sk|rk|pk)-[a-z0-9_-]{8,}/gi,
  /\b(eyJ[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{8,})/gi,
  /((?:api[_-]?key|token|secret|password|authorization)["']?\s*[:=]\s*["']?)[^\s"',}]{6,}/gi,
  /(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+@/gi,
];

/** يخفي المفاتيح وكلمات المرور من النص قبل إرساله لأي نموذج خارجي. */
export function redactSecrets(text: string): string {
  return SECRET_PATTERNS.reduce(
    (out, re) =>
      out.replace(re, (match, prefix: string) =>
        typeof prefix === "string" && match.startsWith(prefix) && prefix !== match
          ? `${prefix}[REDACTED]${match.endsWith("@") ? "@" : ""}`
          : "[REDACTED]",
      ),
    text,
  );
}
