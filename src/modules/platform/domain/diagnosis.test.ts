import { describe, expect, it } from "vitest";
import { redactSecrets } from "./diagnosis";

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
