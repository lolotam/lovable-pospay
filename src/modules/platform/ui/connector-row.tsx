import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";
import type { ConnectorDef } from "../domain/providers";
import type { ConnectorsStatusDto, LoginStartDto } from "../contracts";
import {
  disconnectFn,
  pollAccountLoginFn,
  saveApiKeyFn,
  setDefaultAiFn,
  startAccountLoginFn,
  testConnectorFn,
} from "../functions/connectors.functions";

export interface ConnectorRowProps {
  def: ConnectorDef;
  status: ConnectorsStatusDto;
  onChange: () => void;
}

export function ConnectorRow({ def, status, onChange }: ConnectorRowProps) {
  const conn = status.connected.find((c) => c.provider === def.id);
  const isDefault = status.defaultProvider === def.id;
  const [model, setModel] = useState(
    isDefault && status.defaultModel ? status.defaultModel : (def.models[0] ?? ""),
  );
  const [key, setKey] = useState("");
  const [login, setLogin] = useState<LoginStartDto | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!login) return;
    const id = setInterval(async () => {
      const r = await pollAccountLoginFn({ data: { loginId: login.loginId } }).catch(() => ({
        status: "failed" as const,
        message: "",
      }));
      if (r.status === "pending") return;
      setLogin(null);
      setMsg(r.status === "complete" ? t("conn.done") : t("conn.failed"));
      onChange();
    }, 3000);
    return () => clearInterval(id);
  }, [login, onChange]);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      if (ok) setMsg(ok);
      onChange();
    } catch {
      setMsg(t("conn.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 border-b border-border px-4 py-4 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{def.name}</span>
        <span
          className={
            conn
              ? "rounded px-1.5 py-0.5 text-xs bg-success-soft text-success"
              : "rounded px-1.5 py-0.5 text-xs bg-muted text-muted-foreground"
          }
        >
          {conn ? t("conn.connected") : t("conn.notConnected")}
        </span>
        {isDefault && (
          <span className="rounded bg-warning-soft px-1.5 py-0.5 text-xs text-destructive">
            {t("conn.default")}
          </span>
        )}
        {conn && (
          <span className="ms-auto text-xs text-muted-foreground">
            {t("conn.updated")}: {new Date(conn.updatedAt).toLocaleString()}
          </span>
        )}
      </div>

      {!conn && def.kind === "account" && !login && (
        <Button
          size="sm"
          className="self-start"
          disabled={busy}
          onClick={() =>
            run(async () => setLogin(await startAccountLoginFn({ data: { provider: def.id } })))
          }
        >
          {t("conn.connect")}
        </Button>
      )}
      {login && (
        <div className="flex flex-wrap items-center gap-3 rounded-md bg-muted px-3 py-2 text-sm">
          {login.userCode && (
            <span>
              {t("conn.code")}:{" "}
              <b dir="ltr" className="font-mono">
                {login.userCode}
              </b>
            </span>
          )}
          <a
            href={login.verificationUrl}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline"
          >
            {t("conn.openPage")}
          </a>
          <span className="text-muted-foreground">{t("conn.waiting")}</span>
        </div>
      )}
      {def.kind === "api_key" && (
        <div className="flex gap-2">
          <Input
            type="password"
            dir="ltr"
            value={key}
            placeholder={t("conn.keyPlaceholder")}
            aria-label={def.name}
            onChange={(e) => setKey(e.target.value)}
            className="max-w-sm"
          />
          <Button
            size="sm"
            disabled={busy || key.trim().length < 8}
            onClick={() =>
              run(async () => {
                await saveApiKeyFn({ data: { provider: def.id, value: key } });
                setKey("");
              }, t("conn.done"))
            }
          >
            {t("conn.saveKey")}
          </Button>
        </div>
      )}
      {conn && (
        <div className="flex flex-wrap items-center gap-2">
          {def.models.length > 0 && (
            <>
              <select
                aria-label={t("conn.model")}
                dir="ltr"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              >
                {def.models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const r = await testConnectorFn({ data: { provider: def.id, model } });
                    setMsg(`${t("conn.testOk")} ${r.reply}`);
                  })
                }
              >
                {t("conn.test")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => run(() => setDefaultAiFn({ data: { provider: def.id, model } }))}
              >
                {t("conn.makeDefault")}
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            disabled={busy}
            onClick={() => run(() => disconnectFn({ data: { provider: def.id } }))}
          >
            {t("conn.disconnect")}
          </Button>
        </div>
      )}
      {msg && (
        <p role="status" className="text-xs text-muted-foreground">
          {msg}
        </p>
      )}
    </div>
  );
}
