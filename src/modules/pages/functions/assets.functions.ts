import { createServerFn } from "@tanstack/react-start";
import { assetIdInput, assetAltSchema } from "../contracts";
import { uploadAsset, deleteAsset } from "../use-cases/upload-asset";
export const getPageAssetsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { assetContext } = await import("../persistence/asset-context.server");
  const { withUser } = await import("@/lib/server/db.server");
  const { pgAssetRepository } = await import("../persistence/assets.server");
  const context = await assetContext();
  return withUser(context.userId, async db => {
    const repo = pgAssetRepository(db, context.companyId, context.userId);
    if (!await repo.isOwner()) throw new Error("FORBIDDEN");
    return { enabled: Boolean(process.env["STORAGE_BUCKET"]), assets: await repo.list() };
  });
});
export const uploadPageAssetFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    if (!(input instanceof FormData)) throw new Error("IMAGE_TYPE");
    const file = input.get("file");
    if (!(file instanceof File)) throw new Error("IMAGE_TYPE");
    if (file.size > 2097152 || file.size < 1) throw new Error("IMAGE_SIZE");
    return { file, alt: assetAltSchema.parse(JSON.parse(String(input.get("alt") ?? "{}"))) };
  })
  .handler(async ({ data }) => {
    const { assetContext } = await import("../persistence/asset-context.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { pgAssetRepository } = await import("../persistence/assets.server");
    const { objectStorage } = await import("@/lib/server/object-storage.server");
    const context = await assetContext();
    const bucket = process.env["STORAGE_BUCKET"], endpoint = process.env["STORAGE_ENDPOINT"],
      accessKeyId = process.env["STORAGE_ACCESS_KEY_ID"], secretAccessKey = process.env["STORAGE_SECRET_ACCESS_KEY"];
    if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) throw new Error("STORAGE_DISABLED");
    const storage = objectStorage({ bucket, endpoint, accessKeyId, secretAccessKey, region: process.env["STORAGE_REGION"] ?? "auto" });
    const id = crypto.randomUUID();
    let uploadedKey: string | undefined;
    try {
      return await withUser(context.userId, async db => {
        const result = await uploadAsset(pgAssetRepository(db, context.companyId, context.userId), storage,
          { bytes: new Uint8Array(await data.file.arrayBuffer()), alt: data.alt, companyId: context.companyId, id });
        uploadedKey = result.key;
        return result.asset;
      });
    } catch (error) {
      if (uploadedKey) await storage.deleteObject(uploadedKey);
      throw error;
    }
  });
export const deletePageAssetFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => assetIdInput.parse(input))
  .handler(async ({ data }) => {
    const { assetContext } = await import("../persistence/asset-context.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { pgAssetRepository } = await import("../persistence/assets.server");
    const { objectStorage } = await import("@/lib/server/object-storage.server");
    const context = await assetContext();
    const bucket = process.env["STORAGE_BUCKET"], endpoint = process.env["STORAGE_ENDPOINT"],
      accessKeyId = process.env["STORAGE_ACCESS_KEY_ID"], secretAccessKey = process.env["STORAGE_SECRET_ACCESS_KEY"];
    if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) throw new Error("STORAGE_DISABLED");
    const storage = objectStorage({ bucket, endpoint, accessKeyId, secretAccessKey, region: process.env["STORAGE_REGION"] ?? "auto" });
    await withUser(context.userId, db => deleteAsset(pgAssetRepository(db, context.companyId, context.userId), storage, data.id));
    return { ok: true };
  });
