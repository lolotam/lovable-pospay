// @vitest-environment node
import { readFile } from "node:fs/promises";
import pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getPool, withUser } from "@/lib/server/db.server";
import { callConnector } from "./ai-call.server";
import {
  deleteCredential,
  dropLogin,
  listStatus,
  loadCredential,
  lockActiveLogin,
  saveCredential,
  saveLogin,
} from "./credentials.server";

const url = process.env["POSPAY_TEST_DATABASE_URL"];
const userId = "credential-refresh-admin";
const provider = "kimi_coding";

describe.skipIf(!url)("connector credential refresh under PostgreSQL", () => {
  let admin: pg.Pool;

  beforeAll(async () => {
    const parsed = new URL(url!);
    if (parsed.hostname !== "127.0.0.1" || parsed.pathname !== "/pospay_test") {
      throw new Error("Disposable localhost pospay_test required");
    }
    vi.stubEnv("DATABASE_URL", url);
    vi.stubEnv("PLATFORM_SECRETS_KEY", Buffer.alloc(32, 1).toString("base64"));
    admin = new pg.Pool({ connectionString: url });
    for (const file of ["0001_tenancy_foundation.sql", "0004_platform_connectors.sql"]) {
      await admin.query(await readFile(`db/migrations/${file}`, "utf8"));
    }
    await admin.query("insert into public.platform_admins (user_id) values ($1)", [userId]);
  });

  beforeEach(async () => {
    await withUser(userId, (db) =>
      saveCredential(db, userId, provider, "account", {
        access: "old-access",
        refresh: "old-refresh",
        expires: Date.now() - 1000,
      }),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  afterAll(async () => {
    if (!admin) return;
    await admin.query("delete from public.platform_logins where created_by=$1", [userId]);
    await admin.query("delete from public.platform_credentials where updated_by=$1", [userId]);
    await admin.query("delete from public.platform_admins where user_id=$1", [userId]);
    await admin.end();
    await getPool().end();
    vi.unstubAllEnvs();
  });

  function refreshedResponse() {
    return Response.json({ access_token: "new-access", refresh_token: "new-refresh" });
  }

  it("preserves stored credentials when refresh succeeds without a usable access token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(Response.json({ refresh_token: "fixture" })),
    );
    await expect(loadCredential(userId, provider)).rejects.toThrow("INVALID_REFRESH_RESPONSE");
    await admin.query("update public.platform_credentials set expires_at=null where provider=$1", [
      provider,
    ]);
    await expect(loadCredential(userId, provider)).resolves.toMatchObject({
      access: "old-access",
      refresh: "old-refresh",
    });
  });

  it("clears the default and its model when the default connector is disconnected", async () => {
    await withUser(userId, async (db) => {
      await db.query(
        "insert into public.platform_settings (key,value) values ('ai.provider',$1),('ai.model','fixture')",
        [provider],
      );
      await deleteCredential(db, "codex");
      expect(await listStatus(db)).toMatchObject({
        defaultProvider: provider,
        defaultModel: "fixture",
      });
      await deleteCredential(db, provider);
      expect(await listStatus(db)).toMatchObject({ defaultProvider: null, defaultModel: null });
      expect((await db.query("select key from public.platform_settings")).rows).toEqual([]);
    });
  });

  it("refreshes an expired credential once across concurrent transactions", async () => {
    const fetchMock = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return refreshedResponse();
    });
    vi.stubGlobal("fetch", fetchMock);

    const results = await Promise.all([
      loadCredential(userId, provider),
      loadCredential(userId, provider),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(results.map((credential) => credential.refresh)).toEqual(["new-refresh", "new-refresh"]);
  });

  it("keeps the rotated refresh token when the model request fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(refreshedResponse())
      .mockResolvedValueOnce(new Response("unavailable", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(callConnector(userId, provider, "model", "system", "user")).rejects.toThrow(
      "AI_500",
    );
    await expect(loadCredential(userId, provider)).resolves.toMatchObject({
      access: "new-access",
      refresh: "new-refresh",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("releases the provider lock when a refresh times out", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("Provider timed out", "TimeoutError"))
      .mockResolvedValueOnce(refreshedResponse());
    vi.stubGlobal("fetch", fetchMock);
    await expect(loadCredential(userId, provider)).rejects.toThrow("Provider timed out");
    await expect(loadCredential(userId, provider)).resolves.toMatchObject({
      refresh: "new-refresh",
    });
  });

  it("bounds the wait for a provider row locked by another transaction", async () => {
    const client = await admin.connect();
    try {
      await client.query("begin");
      await client.query(
        "select provider from public.platform_credentials where provider=$1 for update",
        [provider],
      );
      await expect(loadCredential(userId, provider)).rejects.toMatchObject({ code: "55P03" });
    } finally {
      await client.query("rollback");
      client.release();
    }
  }, 7_000);

  it("allows only one transaction to consume a connector login", async () => {
    const loginId = await withUser(userId, (db) => saveLogin(db, userId, provider, {}, 60));
    await withUser(userId, async (db) => {
      expect(await lockActiveLogin(db, loginId)).toMatchObject({ status: "locked", provider });
      await expect(withUser(userId, (other) => lockActiveLogin(other, loginId))).resolves.toEqual({
        status: "busy",
      });
      await dropLogin(db, loginId);
    });
    await expect(withUser(userId, (db) => lockActiveLogin(db, loginId))).resolves.toEqual({
      status: "expired",
    });
  });
});
