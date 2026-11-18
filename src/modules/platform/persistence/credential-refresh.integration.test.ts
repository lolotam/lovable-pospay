// @vitest-environment node
import { readFile } from "node:fs/promises";
import pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getPool, withUser } from "@/lib/server/db.server";
import { callConnector } from "./ai-call.server";
import { loadCredential, saveCredential } from "./credentials.server";

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
    await admin.query("delete from public.platform_credentials where updated_by=$1", [userId]);
    await admin.query("delete from public.platform_admins where user_id=$1", [userId]);
    await admin.end();
    await getPool().end();
    vi.unstubAllEnvs();
  });

  function refreshedResponse() {
    return Response.json({ access_token: "new-access", refresh_token: "new-refresh" });
  }

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
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValueOnce(controller.signal);
    const fetchMock = vi
      .fn<(input: string, options: RequestInit) => Promise<Response>>()
      .mockImplementationOnce(
        async (_input, { signal }) =>
          new Promise((_, reject) => {
            signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
          }),
      )
      .mockResolvedValueOnce(refreshedResponse());
    vi.stubGlobal("fetch", fetchMock);
    try {
      const result = loadCredential(userId, provider);
      const rejected = expect(result).rejects.toThrow("Provider timed out");
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      expect(timeout).toHaveBeenCalledWith(10_000);
      controller.abort(new Error("Provider timed out"));
      await rejected;
      await expect(loadCredential(userId, provider)).resolves.toMatchObject({
        refresh: "new-refresh",
      });
    } finally {
      timeout.mockRestore();
    }
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
});
