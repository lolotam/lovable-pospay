import { inspectImage, assertAssetCapacity } from "../domain/assets";
import type { AssetRepository, AssetStorage, PageAsset } from "../ports/asset-repository";
export async function uploadAsset(repo: AssetRepository, storage: AssetStorage,
  input: { bytes: Uint8Array; alt: PageAsset["alt"]; companyId: string; id: string },
): Promise<{ asset: PageAsset; key: string }> {
  await repo.lock();
  if (!await repo.isOwner()) throw new Error("FORBIDDEN");
  const image = inspectImage(input.bytes);
  assertAssetCapacity((await repo.list()).length);
  const key = `companies/${input.companyId}/pages/${input.id}.${image.ext}`;
  const asset = { id: input.id, contentType: image.contentType, byteSize: input.bytes.length, alt: input.alt };
  await storage.putObject(key, input.bytes, image.contentType);
  try { await repo.insert(asset, key); }
  catch (error) { await storage.deleteObject(key); throw error; }
  return { asset, key };
}
export async function deleteAsset(repo: AssetRepository, storage: AssetStorage, id: string): Promise<void> {
  await repo.lock();
  if (!await repo.isOwner()) throw new Error("FORBIDDEN");
  const key = await repo.remove(id);
  await storage.deleteObject(key);
}
