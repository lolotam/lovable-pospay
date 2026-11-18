import type pg from "pg";
import { findConnector } from "../domain/providers";
import type { Credential } from "./oauth-flows.server";
import { loadCredential } from "./credentials.server";

const CHAT_BASE: Record<string, string> = {
  kimi_coding: "https://api.kimi.ai/coding/v1",
  minimax_coding: "https://api.minimax.io/v1",
  zai_coding: "https://api.z.ai/api/coding/paas/v4",
  openai: "https://api.openai.com/v1",
  google_ai: "https://generativelanguage.googleapis.com/v1beta/openai",
  openrouter: "https://openrouter.ai/api/v1",
  minimax: "https://api.minimax.io/v1",
};
class HttpError extends Error { constructor(m: string, public status: number) { super(m); } }

async function codexCall(c: Credential, model: string, system: string, user: string) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${c.access}`, "Content-Type": "application/json", Accept: "text/event-stream",
    originator: "codex_cli_rs", "OpenAI-Beta": "responses=experimental", session_id: crypto.randomUUID(),
  };
  if (c.extras?.["accountId"]) headers["ChatGPT-Account-ID"] = String(c.extras["accountId"]);
  const res = await fetch("https://chatgpt.com/backend-api/codex/responses", {
    method: "POST", headers,
    body: JSON.stringify({ model, instructions: system, input: [{ role: "user", content: [{ type: "input_text", text: user }] }], stream: true, store: false }),
  });
  if (!res.ok) throw new HttpError(`CODEX_${res.status}: ${(await res.text()).slice(0, 300)}`, res.status);
  let out = "";
  for (const line of (await res.text()).split("\n")) {
    if (!line.startsWith("data:")) continue;
    try {
      const ev = JSON.parse(line.slice(5).trim());
      if (ev.type === "response.output_text.delta") out += ev.delta;
    } catch { continue; }
  }
  return out;
}
async function chatCall(provider: string, c: Credential, model: string, system: string, user: string) {
  const res = await fetch(`${CHAT_BASE[provider]}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.access}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  });
  if (!res.ok) throw new HttpError(`AI_${res.status}: ${(await res.text()).slice(0, 300)}`, res.status);
  const j = await res.json();
  return String(j.choices?.[0]?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

/** Runs one prompt through a connected platform connector; retries once after a 401 with a fresh token. */
export async function callConnector(db: pg.PoolClient, userId: string, provider: string, model: string, system: string, user: string) {
  const def = findConnector(provider);
  if (!def || def.group === "messaging") throw new Error("NOT_AI_CONNECTOR");
  const run = (c: Credential) => (provider === "codex" ? codexCall(c, model, system, user) : chatCall(provider, c, model, system, user));
  try {
    return await run(await loadCredential(db, userId, provider));
  } catch (e) {
    if (!(e instanceof HttpError) || e.status !== 401 || def.kind !== "account") throw e;
    return run(await loadCredential(db, userId, provider, true));
  }
}
