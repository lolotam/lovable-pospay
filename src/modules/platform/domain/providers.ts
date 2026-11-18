/** نوع الموصل: دخول بحساب اشتراك أو مفتاح API ملصوق. */
export type ConnectorKind = "account" | "api_key";

/** تصنيف الموصل في صفحة الـ super admin. */
export type ConnectorGroup = "ai_account" | "ai_key" | "messaging";

/** وصف موصل واحد متاح للمنصة. */
export interface ConnectorDef {
  id: string;
  kind: ConnectorKind;
  group: ConnectorGroup;
  name: string;
  models: readonly string[];
}

/** كل الموصلات المتاحة، منسوخة من مشروع prolifepharma ومرتبة حسب المجموعة. */
export const CONNECTORS: readonly ConnectorDef[] = [
  { id: "codex", kind: "account", group: "ai_account", name: "ChatGPT (Codex)", models: ["gpt-5.1-codex-mini", "gpt-5.1-codex", "gpt-5.1"] },
  { id: "kimi_coding", kind: "account", group: "ai_account", name: "Kimi Coding Plan", models: ["kimi-for-coding"] },
  { id: "minimax_coding", kind: "account", group: "ai_account", name: "MiniMax Coding Plan", models: ["MiniMax-M2.5", "MiniMax-M3.1-Flash"] },
  { id: "zai_coding", kind: "account", group: "ai_account", name: "Z.ai GLM Coding Plan", models: ["glm-4.6", "glm-4.5-air"] },
  { id: "openai", kind: "api_key", group: "ai_key", name: "OpenAI", models: ["gpt-5.1", "gpt-5.1-mini"] },
  { id: "google_ai", kind: "api_key", group: "ai_key", name: "Google AI Studio", models: ["gemini-2.5-flash", "gemini-2.5-pro"] },
  { id: "openrouter", kind: "api_key", group: "ai_key", name: "OpenRouter", models: ["openai/gpt-5.1-mini", "anthropic/claude-sonnet-4.5"] },
  { id: "minimax", kind: "api_key", group: "ai_key", name: "MiniMax API", models: ["MiniMax-M2.5"] },
  { id: "resend", kind: "api_key", group: "messaging", name: "Resend", models: [] },
];

/** يرجع تعريف الموصل أو null لو المعرّف غير معروف. */
export function findConnector(id: string): ConnectorDef | null {
  return CONNECTORS.find((c) => c.id === id) ?? null;
}

/** يتحقق إن الموديل مسموح للموصل؛ الموصل اللي مالوش موديلات يرفض أي موديل. */
export function isAllowedModel(id: string, model: string): boolean {
  return findConnector(id)?.models.includes(model) ?? false;
}

/** يقرر إن التوكن محتاج تجديد: باقي أقل من 10 دقايق على انتهائه. */
export function needsRefresh(expiresAtMs: number | null, nowMs: number): boolean {
  return expiresAtMs !== null && expiresAtMs - nowMs < 10 * 60 * 1000;
}
