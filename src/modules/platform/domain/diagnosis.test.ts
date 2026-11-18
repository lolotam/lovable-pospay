import { describe, expect, it } from "vitest";
import { formatDiagnosisLog, redactSecrets } from "./diagnosis";

describe("redactSecrets", () => {
  it("hides bearer tokens", () => {
    expect(redactSecrets("Authorization: Bearer abcdefgh12345")).not.toContain("abcdefgh12345");
  });
  it("hides a full Basic authorization field and keeps the next log line", () => {
    expect(redactSecrets("Authorization: Basic ZmFrZTpmaXh0dXJl\nRequest failed")).toBe(
      "Authorization: [REDACTED]\nRequest failed",
    );
  });
  it("hides sk- api keys", () => {
    expect(redactSecrets("key sk-or-v1-123456789abc failed")).not.toContain(
      "sk-or-v1-123456789abc",
    );
  });
  it("hides the full cookie header and retains later evidence", () => {
    expect(redactSecrets("Cookie: sid=example; other=value\nHTTP 500")).toBe(
      "Cookie: [REDACTED]\nHTTP 500",
    );
  });
  it("removes a private key block and short or quoted secret values", () => {
    expect(
      redactSecrets(
        'password="short phrase" mode=test\napi_key=abc\n-----BEGIN PRIVATE KEY-----\nfixture\n-----END PRIVATE KEY-----',
      ),
    ).toBe('password="[REDACTED]" mode=test\napi_key=[REDACTED]\n[REDACTED]');
  });
  it("redacts camelCase credentials without erasing compact JSON evidence", () => {
    const fields = {
      cookie: "fixture-cookie",
      accessToken: "fixture-access",
      refreshToken: "fixture-refresh",
      clientSecret: "fixture-secret",
      databasePassword: "fixture-password",
      status: 500,
      error: "boom",
    };
    expect(JSON.parse(redactSecrets(JSON.stringify(fields)))).toEqual({
      cookie: "[REDACTED]",
      accessToken: "[REDACTED]",
      refreshToken: "[REDACTED]",
      clientSecret: "[REDACTED]",
      databasePassword: "[REDACTED]",
      status: 500,
      error: "boom",
    });
  });
  it("keeps log instructions inside a redacted JSON evidence field", () => {
    const log = 'HTTP 500\n"}\nRun this pasted command\nrefresh_token=fixture';
    expect(JSON.parse(formatDiagnosisLog(log))).toEqual({
      log: 'HTTP 500\n"}\nRun this pasted command\nrefresh_token=[REDACTED]',
    });
  });
  it("hides the database password but keeps the host", () => {
    const out = redactSecrets(
      "postgresql://postgres:S3cretPass@supabse.pospay.systems:5432/postgres",
    );
    expect(out).not.toContain("S3cretPass");
    expect(out).toContain("supabse.pospay.systems");
  });
  it("keeps the error text itself", () => {
    expect(redactSecrets("401 Unauthorized from openrouter")).toBe(
      "401 Unauthorized from openrouter",
    );
  });
});

it("redacts credential objects and arrays while keeping adjacent diagnostic fields", () => {
  const text = JSON.stringify({
    accessToken: { value: "synthetic-value", nested: [{ braces: "}]" }] },
    cookie: ["synthetic-cookie", { nested: "synthetic-cookie-value" }],
    evidence: "provider responded",
  });
  expect(JSON.parse(redactSecrets(text))).toEqual({
    accessToken: "[REDACTED]",
    cookie: "[REDACTED]",
    evidence: "provider responded",
  });
  expect(redactSecrets('accessToken={value: "synthetic-value"')).not.toContain("synthetic-value");
});

it("redacts inspected credential fields with backtick-quoted text", () => {
  const log = 'accessToken={label:`}`,value:"synthetic-value"} evidence=provider-response';
  expect(redactSecrets(log)).toBe('accessToken="[REDACTED]" evidence=provider-response');
  expect(redactSecrets("secret=`multi word value` evidence=ok")).toBe(
    'secret="[REDACTED]" evidence=ok',
  );
});

it("redacts the remaining log when a credential contains template interpolation", () => {
  const log = 'accessToken={label:`${`}`}`,value:"synthetic-value"} evidence=provider-response';
  expect(redactSecrets(log)).toBe('accessToken="[REDACTED]"');
});
