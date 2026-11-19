// @vitest-environment node
// D2 acceptance against real PostgreSQL/RLS and a real Cloudflare R2 test bucket.
// Runs only with POSPAY_TEST_DATABASE_URL (disposable pospay_test) and the
// POSPAY_TEST_STORAGE_* variables; it refuses any bucket whose name mentions production.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { withUser } from "@/lib/server/db.server";
import { objectStorage, type StorageConfig } from "@/lib/server/object-storage.server";
import { deleteAsset, uploadAsset } from "../use-cases/upload-asset";
import { publishPage, unpublishPage } from "../use-cases/publish-page";
import { saveDraft } from "../use-cases/save-draft";
import { pgAssetRepository } from "./assets.server";
import { pgPageRepository } from "./page.server";
import { serveAsset } from "./media.server";
import type { PageDocument } from "../contracts";

const session = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/server/session.server", () => ({
  requireSession: async () => {
    if (!session.userId) throw new Error("UNAUTHENTICATED");
    return { user: { id: session.userId } };
  },
}));

const dbUrl = process.env["POSPAY_TEST_DATABASE_URL"];
const env = (name: string) => process.env[`POSPAY_TEST_STORAGE_${name}`];
const storageConfig: StorageConfig | null =
  env("ENDPOINT") && env("BUCKET") && env("ACCESS_KEY_ID") && env("SECRET_ACCESS_KEY")
    ? {
        endpoint: env("ENDPOINT")!,
        bucket: env("BUCKET")!,
        accessKeyId: env("ACCESS_KEY_ID")!,
        secretAccessKey: env("SECRET_ACCESS_KEY")!,
        region: env("REGION") ?? "auto",
      }
    : null;

const company = "93000000-0000-4000-8000-000000000001";
const foreign = "93000000-0000-4000-8000-000000000002";
const assetId = "93000000-0000-4000-8000-0000000000a1";
const staffAssetId = "93000000-0000-4000-8000-0000000000a2";
// 1x1 transparent PNG.
const png = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
  ),
);
const alt = { ar: "صورة", en: "Image" };
const galleryDoc = (id: string): PageDocument => ({
  blocks: [
    {
      id: "93000000-0000-4000-8000-0000000000b1",
      type: "gallery",
      hidden: false,
      images: [{ assetId: id, alt }],
    },
  ],
});
const emptyDoc: PageDocument = { blocks: [] };

describe.skipIf(!dbUrl || !storageConfig)("D2 page images on real RLS and R2", () => {
  let admin: pg.Pool;
  const storage = () => objectStorage(storageConfig!);
  const createdKeys = new Set<string>();
  const assetsAs = (user: string, companyId: string) =>
    withUser(user, async (db) => pgAssetRepository(db, companyId, user).list());
  const upload = (user: string, id: string) =>
    withUser(user, (db) =>
      uploadAsset(pgAssetRepository(db, company, user), storage(), {
        bytes: png,
        alt,
        companyId: company,
        id,
      }),
    );
  const remove = (user: string, id: string) =>
    withUser(user, (db) => deleteAsset(pgAssetRepository(db, company, user), storage(), id));
  const pages = <T>(
    user: string,
    companyId: string,
    run: (repo: ReturnType<typeof pgPageRepository>) => Promise<T>,
  ) => withUser(user, (db) => run(pgPageRepository(db, companyId, user)));
  const serveAs = async (user: string) => {
    session.userId = user;
    return serveAsset(assetId, storageConfig!);
  };

  beforeAll(async () => {
    const parsed = new URL(dbUrl!);
    if (parsed.hostname !== "127.0.0.1" || parsed.pathname !== "/pospay_test")
      throw new Error("Disposable localhost pospay_test required");
    if (/prod/i.test(storageConfig!.bucket)) throw new Error("Refusing a production bucket");
    vi.stubEnv("DATABASE_URL", dbUrl!);
    admin = new pg.Pool({ connectionString: dbUrl });
    await admin.query("insert into companies(id,name) values($1,'D2 salon'),($2,'D2 other')", [
      company,
      foreign,
    ]);
    await admin.query(
      `insert into memberships(company_id,user_id,role) values
        ($1,'d2-owner','owner'),($1,'d2-staff','staff'),($2,'d2-outsider','owner')`,
      [company, foreign],
    );
  });
  afterAll(async () => {
    for (const key of createdKeys)
      await storage()
        .deleteObject(key)
        .catch(() => undefined);
    if (admin) {
      await admin.query("delete from company_pages where company_id = any($1::uuid[])", [
        [company, foreign],
      ]);
      await admin.query("delete from company_assets where company_id = any($1::uuid[])", [
        [company, foreign],
      ]);
      await admin.query("delete from companies where id = any($1::uuid[])", [[company, foreign]]);
      await admin.end();
    }
    vi.unstubAllEnvs();
  });

  it("stores an owner upload in R2 under a server-chosen key", async () => {
    const { key } = await upload("d2-owner", assetId);
    createdKeys.add(key);
    expect(key).toBe(`companies/${company}/pages/${assetId}.png`);
    const stored = new Uint8Array(await (await storage().getObject(key)).arrayBuffer());
    expect(stored).toEqual(png);
  });

  it("keeps assets owner-only under RLS", async () => {
    await expect(upload("d2-staff", staffAssetId)).rejects.toThrow("FORBIDDEN");
    expect(await assetsAs("d2-owner", company)).toHaveLength(1);
    expect(await assetsAs("d2-staff", company)).toHaveLength(0);
    expect(await assetsAs("d2-outsider", company)).toHaveLength(0);
    expect(
      (await admin.query("select 1 from company_assets where id=$1", [staffAssetId])).rows,
    ).toHaveLength(0);
  });

  it("serves an unpublished image only to its owner", async () => {
    expect((await serveAs("")).status).toBe(404);
    expect((await serveAs("d2-staff")).status).toBe(404);
    expect((await serveAs("d2-outsider")).status).toBe(404);
    const own = await serveAs("d2-owner");
    expect(own.status).toBe(200);
    expect(own.headers.get("Cache-Control")).toBe("private, no-store");
    expect(new Uint8Array(await own.arrayBuffer())).toEqual(png);
  });

  it("refuses another company's asset id in a page document", async () => {
    await expect(
      pages("d2-outsider", foreign, (repo) =>
        saveDraft(repo, { slug: "d2-outsider-page", document: galleryDoc(assetId), version: 0 }),
      ),
    ).rejects.toThrow();
  });

  it("serves a published image publicly and blocks deleting it while used", async () => {
    const draft = await pages("d2-owner", company, (repo) =>
      saveDraft(repo, { slug: "d2-r2-page", document: galleryDoc(assetId), version: 0 }),
    );
    await pages("d2-owner", company, (repo) => publishPage(repo, draft.version));
    const response = await serveAs("");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=300");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(png);
    await expect(remove("d2-owner", assetId)).rejects.toThrow("ASSET_IN_USE");
  });

  it("never serves an image that is only in a hidden block publicly", async () => {
    const current = await pages("d2-owner", company, (repo) => repo.draft());
    const hidden = galleryDoc(assetId);
    hidden.blocks = [
      { ...hidden.blocks[0]!, hidden: true },
      { id: "93000000-0000-4000-8000-0000000000b2", type: "about", hidden: false, body: alt },
    ];
    const saved = await pages("d2-owner", company, (repo) =>
      saveDraft(repo, { slug: "d2-r2-page", document: hidden, version: current.version }),
    );
    await pages("d2-owner", company, (repo) => publishPage(repo, saved.version));
    expect((await serveAs("")).status).toBe(404);
  });

  it("deletes the row and the R2 object once no document uses the image", async () => {
    const key = `companies/${company}/pages/${assetId}.png`;
    const unpublished = await pages("d2-owner", company, unpublishPage);
    await pages("d2-owner", company, (repo) =>
      saveDraft(repo, { slug: "d2-r2-page", document: emptyDoc, version: unpublished.version }),
    );
    await expect(remove("d2-staff", assetId)).rejects.toThrow("FORBIDDEN");
    await remove("d2-owner", assetId);
    expect(await assetsAs("d2-owner", company)).toHaveLength(0);
    await expect(storage().getObject(key)).rejects.toThrow("STORAGE_FAILED");
    expect((await serveAs("d2-owner")).status).toBe(404);
  });
});
